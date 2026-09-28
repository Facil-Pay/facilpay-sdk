var __typeError = (msg) => {
  throw TypeError(msg);
};
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/core/errors.ts
var FacilPayError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FacilPayError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var FacilPayConnectionError = class extends FacilPayError {
  constructor(message = "Failed to connect to the FacilPay API", cause) {
    super(message);
    this.name = "FacilPayConnectionError";
    this.cause = cause;
  }
};

// src/core/http.ts
var DEFAULT_BASE_URL = "https://api.facilpay.io";
var DEFAULT_TIMEOUT = 3e4;
function detectRuntime() {
  const g = globalThis;
  if (typeof g.Bun !== "undefined") return "bun";
  if (typeof g.Deno !== "undefined") return "deno";
  if (typeof g.EdgeRuntime !== "undefined") return "edge";
  if (typeof g.window !== "undefined" && typeof g.document !== "undefined") return "browser";
  if (typeof g.process !== "undefined") return "node";
  return "unknown";
}
function stripTrailingSlashes(url) {
  return url.replace(/\/+$/, "");
}
function serializeQueryValue(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
function serializeQuery(query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === void 0) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === void 0) continue;
        params.append(key, serializeQueryValue(item));
      }
    } else {
      params.append(key, serializeQueryValue(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
function buildUrl(baseUrl, path, query) {
  const base = stripTrailingSlashes(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}/v1${normalizedPath}${serializeQuery(query)}`;
}
var HttpClient = class {
  constructor(options = {}) {
    this.baseUrl = stripTrailingSlashes(options.baseUrl ?? DEFAULT_BASE_URL);
    this.version = options.version ?? "0.0.0";
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = { ...options.headers };
  }
  buildHeaders(extra, idempotencyKey) {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `facilpay-sdk-js/${this.version} (${detectRuntime()})`,
      "X-FacilPay-Client": `facilpay-sdk-js/${this.version} (${detectRuntime()})`,
      ...this.defaultHeaders,
      ...extra
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return headers;
  }
  async request(options) {
    const {
      method = "GET",
      path,
      query,
      body,
      headers,
      idempotencyKey,
      signal,
      responseType = "json",
      timeout = this.timeout
    } = options;
    const url = buildUrl(this.baseUrl, path, query);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: this.buildHeaders(headers, idempotencyKey),
        body: body === void 0 ? void 0 : JSON.stringify(body),
        signal: controller.signal
      });
      const requestId = response.headers.get("x-request-id") ?? void 0;
      const correlationId = response.headers.get("x-correlation-id") ?? void 0;
      if (!response.ok) {
        const errorBody = await this.parseBody(response, responseType);
        throw new FacilPayError(
          `Request failed with status ${response.status}`,
          response.status,
          errorBody,
          requestId,
          correlationId
        );
      }
      const data = await this.parseBody(response, responseType);
      return { data, status: response.status, headers: response.headers, requestId, correlationId };
    } catch (error) {
      if (error instanceof FacilPayError) throw error;
      if (timedOut) {
        throw new FacilPayConnectionError(`Request timed out after ${timeout}ms`, error);
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new FacilPayConnectionError("Request was aborted", error);
      }
      throw new FacilPayConnectionError("Network request failed", error);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onExternalAbort);
    }
  }
  async parseBody(response, responseType) {
    if (responseType === "arrayBuffer") return response.arrayBuffer();
    if (responseType === "text") return response.text();
    const text = await response.text();
    if (!text) return void 0;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
};

// src/client.ts
var TEST_KEY_PREFIX = "fp_test_";
var LIVE_KEY_PREFIX = "fp_live_";
function resolveApiKey(options) {
  const provided = options.apiKey;
  if (provided !== void 0 && provided !== null && provided !== "") {
    return provided;
  }
  if (typeof process !== "undefined" && process.env) {
    const fromEnv = process.env.FACILPAY_API_KEY;
    if (fromEnv) {
      return fromEnv;
    }
  }
  throw new FacilPayError(
    "Missing API key. Provide `apiKey` in the FacilPay constructor options or set the FACILPAY_API_KEY environment variable."
  );
}
function detectEnvironment(apiKey) {
  if (apiKey.startsWith(TEST_KEY_PREFIX)) {
    return "test";
  }
  if (apiKey.startsWith(LIVE_KEY_PREFIX)) {
    return "live";
  }
  throw new FacilPayError(
    'Invalid API key. Expected a key starting with "fp_test_" or "fp_live_".'
  );
}
var _apiKey, _liveWarningLogged, _FacilPay_instances, warnLiveKeyInBrowser_fn;
var FacilPay = class {
  constructor(options = {}) {
    __privateAdd(this, _FacilPay_instances);
    __privateAdd(this, _apiKey);
    __privateAdd(this, _liveWarningLogged, false);
    const apiKey = resolveApiKey(options);
    const environment = detectEnvironment(apiKey);
    __privateSet(this, _apiKey, apiKey);
    this.environment = environment;
    this.isTestMode = environment === "test";
    if (environment === "live" && typeof window !== "undefined") {
      __privateMethod(this, _FacilPay_instances, warnLiveKeyInBrowser_fn).call(this);
    }
    this.http = new HttpClient({
      ...options,
      headers: {
        ...options.headers,
        Authorization: `ApiKey ${apiKey}`
      }
    });
  }
  request(options) {
    return this.http.request(options);
  }
  toString() {
    return `FacilPay { environment: '${this.environment}' }`;
  }
  toJSON() {
    return { environment: this.environment, isTestMode: this.isTestMode };
  }
};
_apiKey = new WeakMap();
_liveWarningLogged = new WeakMap();
_FacilPay_instances = new WeakSet();
warnLiveKeyInBrowser_fn = function() {
  if (__privateGet(this, _liveWarningLogged)) {
    return;
  }
  __privateSet(this, _liveWarningLogged, true);
  console.warn(
    "[facilpay] A live API key (fp_live_) is being used in a browser environment. Live keys should only be used from trusted server-side code."
  );
};

// src/core/version.ts
var VERSION = "0.1.0";

// src/errors.ts
var FacilPayError2 = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FacilPayError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var FacilPaySignatureVerificationError = class extends FacilPayError2 {
  constructor(message) {
    super(message);
    this.name = "FacilPaySignatureVerificationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// src/webhooks/verify.ts
var HEX_RE = /^[0-9a-fA-F]+$/;
function isBytes(value) {
  return value instanceof Uint8Array || typeof Buffer !== "undefined" && Buffer.isBuffer(value);
}
function toBytes(payload) {
  if (typeof payload === "string") {
    return new TextEncoder().encode(payload);
  }
  if (isBytes(payload)) {
    return payload;
  }
  throw new FacilPaySignatureVerificationError(
    "Webhook payload must be the raw request body as a string, Uint8Array, or Buffer. Do not pass a parsed object: verify the signature against the raw body before parsing JSON."
  );
}
function normalizeSecrets(secret) {
  const secrets = Array.isArray(secret) ? secret : [secret];
  if (secrets.length === 0 || secrets.some((s) => typeof s !== "string" || s.length === 0)) {
    throw new FacilPaySignatureVerificationError(
      "A webhook signing secret (or non-empty array of secrets) is required."
    );
  }
  return secrets;
}
function parseSignatureHeader(signature) {
  if (typeof signature !== "string" || signature.length === 0) {
    throw new FacilPaySignatureVerificationError(
      "Missing X-FacilPay-Signature header."
    );
  }
  if (signature.includes("=")) {
    const parts = signature.split(",");
    const signatures = [];
    let timestamp;
    for (const part of parts) {
      const [key, value] = part.split("=", 2).map((p) => p.trim());
      if (key === "t") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new FacilPaySignatureVerificationError(
            "Malformed timestamp in X-FacilPay-Signature header."
          );
        }
        timestamp = parsed;
      } else if (key === "v1" || key === "v0") {
        signatures.push(value);
      }
    }
    if (signatures.length === 0) {
      throw new FacilPaySignatureVerificationError(
        "Malformed X-FacilPay-Signature header: no signature value found."
      );
    }
    return { signatures, timestamp };
  }
  return { signatures: [signature.trim()] };
}
function assertHex(value) {
  if (value.length === 0 || value.length % 2 !== 0 || !HEX_RE.test(value)) {
    throw new FacilPaySignatureVerificationError(
      "Malformed X-FacilPay-Signature header: expected a hex-encoded HMAC-SHA256 digest."
    );
  }
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
function bytesToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
function getNodeCrypto() {
  try {
    const req = typeof __require === "function" ? __require : void 0;
    if (req) {
      return req("node:crypto");
    }
  } catch {
  }
  return void 0;
}
function computeNodeHmac(payload, secret, nodeCrypto) {
  return nodeCrypto.createHmac("sha256", secret).update(payload).digest();
}
async function computeWebHmac(payload, secret) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new FacilPaySignatureVerificationError(
      "No crypto implementation available: expected node:crypto or Web Crypto (crypto.subtle)."
    );
  }
  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await subtle.sign("HMAC", key, payload);
  return new Uint8Array(digest);
}
function checkTolerance(timestamp, options) {
  if (timestamp === void 0 || options?.tolerance === void 0) {
    return;
  }
  const now = options.now ?? Math.floor(Date.now() / 1e3);
  if (Math.abs(now - timestamp) > options.tolerance) {
    throw new FacilPaySignatureVerificationError(
      "Webhook timestamp is outside the allowed tolerance."
    );
  }
}
function matchesAny(expected, candidates) {
  let matched = false;
  for (const candidate of candidates) {
    assertHex(candidate);
    const provided = hexToBytes(candidate);
    if (constantTimeEqual(expected, provided)) {
      matched = true;
    }
  }
  return matched;
}
function verifySignature(payload, signature, secret, options) {
  const body = toBytes(payload);
  const secrets = normalizeSecrets(secret);
  const { signatures, timestamp } = parseSignatureHeader(signature);
  checkTolerance(timestamp, options);
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto) {
    let matched = false;
    for (const s of secrets) {
      const expected = computeNodeHmac(body, s, nodeCrypto);
      if (matchesAny(expected, signatures)) {
        matched = true;
      }
    }
    if (!matched) {
      throw new FacilPaySignatureVerificationError(
        "Webhook signature verification failed."
      );
    }
    return true;
  }
  throw new FacilPaySignatureVerificationError(
    "Synchronous verification requires node:crypto. Use Webhooks.constructEvent() on edge runtimes."
  );
}
async function constructEvent(payload, signature, secret, options) {
  const body = toBytes(payload);
  const secrets = normalizeSecrets(secret);
  const { signatures, timestamp } = parseSignatureHeader(signature);
  checkTolerance(timestamp, options);
  let matched = false;
  for (const s of secrets) {
    const expected = await computeWebHmac(body, s);
    if (matchesAny(expected, signatures)) {
      matched = true;
    }
  }
  if (!matched) {
    throw new FacilPaySignatureVerificationError(
      "Webhook signature verification failed."
    );
  }
  const text = typeof payload === "string" ? payload : new TextDecoder().decode(body);
  return JSON.parse(text);
}
function generateTestHeader(payload, secret) {
  const body = toBytes(payload);
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto) {
    return bytesToHex(computeNodeHmac(body, secret, nodeCrypto));
  }
  throw new FacilPaySignatureVerificationError(
    "generateTestHeader requires node:crypto."
  );
}
var Webhooks = {
  verifySignature,
  constructEvent,
  generateTestHeader
};

// src/index.ts
var src_default = FacilPay;

export { FacilPay, FacilPayError, VERSION, Webhooks, src_default as default };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map