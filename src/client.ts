import { HttpClient, type HttpClientOptions } from './core/http';
import { FacilPayError } from './core/errors';

export type FacilPayEnvironment = 'test' | 'live';

export interface FacilPayOptions extends HttpClientOptions {
  apiKey?: string;
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

export class FacilPay {
  readonly http: HttpClient;
  readonly environment: FacilPayEnvironment;
  readonly isTestMode: boolean;

  #apiKey: string;
  #liveWarningLogged = false;

  constructor(options: FacilPayOptions = {}) {
    const apiKey = resolveApiKey(options);
    const environment = detectEnvironment(apiKey);

    this.#apiKey = apiKey;
    this.environment = environment;
    this.isTestMode = environment === 'test';

    if (environment === 'live' && typeof window !== 'undefined') {
      this.#warnLiveKeyInBrowser();
    }

    this.http = new HttpClient({
      ...options,
      headers: {
        ...options.headers,
        Authorization: `ApiKey ${apiKey}`,
      },
    });
  }

  #warnLiveKeyInBrowser(): void {
    if (this.#liveWarningLogged) {
      return;
    }
    this.#liveWarningLogged = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[facilpay] A live API key (fp_live_) is being used in a browser environment. Live keys should only be used from trusted server-side code.',
    );
  }

  request<T>(options: Parameters<HttpClient['request']>[0]): Promise<T> {
    return this.http.request<T>(options);
  }

  toString(): string {
    return `FacilPay { environment: '${this.environment}' }`;
  }

  toJSON(): { environment: FacilPayEnvironment; isTestMode: boolean } {
    return { environment: this.environment, isTestMode: this.isTestMode };
  }
}
