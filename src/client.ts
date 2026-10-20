import { HttpClient, type HttpClientOptions } from './core/http';
import { FacilPayError } from './core/errors';
import { ApiKeysResource } from './resources/api-keys';
import { DisputesResource } from './resources/disputes';
import { PaymentLinksResource } from './resources/payment-links';
import { Payments } from './resources/payments';
import { RecurringPaymentsResource } from './resources/recurring-payments';
import { Stellar } from './resources/stellar';
import { WebhooksResource } from './resources/webhooks';

export type FacilPayEnvironment = 'test' | 'live';

export interface FacilPayOptions extends HttpClientOptions {
  apiKey?: string;
  /**
   * Base URL for hosted payment-link checkout pages, used by
   * `paymentLinks.checkoutUrl()`. Defaults to `''` (relative links).
   */
  checkoutBaseUrl?: string;
}

const TEST_KEY_PREFIX = 'fp_test_';
const LIVE_KEY_PREFIX = 'fp_live_';

function resolveApiKey(options: FacilPayOptions): string {
  const provided = options.apiKey;
  if (provided !== undefined && provided !== null && provided !== '') {
    return provided;
  }
  if (typeof process !== 'undefined' && process.env) {
    const fromEnv = process.env.FACILPAY_API_KEY;
    if (fromEnv) {
      return fromEnv;
    }
  }
  throw new FacilPayError(
    'Missing API key. Provide `apiKey` in the FacilPay constructor options or set the FACILPAY_API_KEY environment variable.',
  );
}

function detectEnvironment(apiKey: string): FacilPayEnvironment {
  if (apiKey.startsWith(TEST_KEY_PREFIX)) {
    return 'test';
  }
  if (apiKey.startsWith(LIVE_KEY_PREFIX)) {
    return 'live';
  }
  throw new FacilPayError(
    'Invalid API key. Expected a key starting with "fp_test_" or "fp_live_".',
  );
}

function validateOptions(options: FacilPayOptions): void {
  const { timeout, maxRetries, baseUrl } = options;

  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
      throw new FacilPayError(
        `Invalid \`timeout\` option: expected a positive number of milliseconds, received ${String(timeout)}.`,
      );
    }
  }

  if (maxRetries !== undefined) {
    if (typeof maxRetries !== 'number' || !Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new FacilPayError(
        `Invalid \`maxRetries\` option: expected a non-negative integer, received ${String(maxRetries)}.`,
      );
    }
  }

  if (baseUrl !== undefined) {
    let protocol: string | undefined;
    try {
      protocol = new URL(baseUrl).protocol;
    } catch {
      protocol = undefined;
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new FacilPayError(
        `Invalid \`baseUrl\` option: expected an absolute http(s) URL such as "https://api.facilpay.io", received "${String(baseUrl)}".`,
      );
    }
  }

  if (options.fetch !== undefined && typeof options.fetch !== 'function') {
    throw new FacilPayError('Invalid `fetch` option: expected a fetch-compatible function.');
  }

  if (options.fetch === undefined && typeof globalThis.fetch !== 'function') {
    throw new FacilPayError(
      'No `fetch` implementation found. This runtime does not provide a global `fetch`; pass one via the `fetch` option (e.g. `new FacilPay({ fetch: nodeFetch })`) or upgrade to Node.js 18+.',
    );
  }
}

export class FacilPay {
  readonly http: HttpClient;
  readonly payments: Payments;
  readonly paymentLinks: PaymentLinksResource;
  readonly disputes: DisputesResource;
  readonly recurringPayments: RecurringPaymentsResource;
  readonly webhooks: WebhooksResource;
  readonly apiKeys: ApiKeysResource;
  readonly stellar: Stellar;
  readonly environment: FacilPayEnvironment;
  readonly isTestMode: boolean;

  #apiKey: string;
  #liveWarningLogged = false;

  constructor(options: FacilPayOptions = {}) {
    validateOptions(options);
    const apiKey = resolveApiKey(options);
    const environment = detectEnvironment(apiKey);

    this.#apiKey = apiKey;
    this.environment = environment;
    this.isTestMode = environment === 'test';

    if (environment === 'live' && typeof window !== 'undefined') {
      this.#warnLiveKeyInBrowser();
    }

    // The raw apiKey must not reach HttpClient: it would set its own
    // Authorization header and overwrite the `ApiKey` scheme below.
    // Auth is set here, in exactly one place.
    const httpOptions: HttpClientOptions = { ...options };
    delete httpOptions.apiKey;

    this.http = new HttpClient({
      ...httpOptions,
      headers: {
        ...httpOptions.headers,
        Authorization: `ApiKey ${apiKey}`,
      },
    });

    this.payments = new Payments(this.http);
    this.paymentLinks = new PaymentLinksResource(this.http, options.checkoutBaseUrl);
    this.disputes = new DisputesResource(this.http);
    this.recurringPayments = new RecurringPaymentsResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.apiKeys = new ApiKeysResource(this.http);
    this.stellar = new Stellar(this.http);
  }

  #warnLiveKeyInBrowser(): void {
    if (this.#liveWarningLogged) {
      return;
    }
    this.#liveWarningLogged = true;
    console.warn(
      '[facilpay] A live API key (fp_live_) is being used in a browser environment. Live keys should only be used from trusted server-side code.',
    );
  }

  async request<T>(options: Parameters<HttpClient['request']>[0]): Promise<T> {
    return (await this.http.request<T>(options)).data;
  }

  toString(): string {
    return `FacilPay { environment: '${this.environment}' }`;
  }

  /** Prevents `util.inspect` from leaking the key or auth headers. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }

  toJSON(): { environment: FacilPayEnvironment; isTestMode: boolean } {
    return { environment: this.environment, isTestMode: this.isTestMode };
  }
}
