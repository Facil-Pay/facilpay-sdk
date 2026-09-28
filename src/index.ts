import { FacilPay } from './client';
import { FacilPayError } from './core/errors';
import { VERSION } from './core/version';

export { FacilPay, FacilPayError, VERSION };
export type { FacilPayOptions, Environment } from './client';
export type { Logger } from './core/http';

// Soroban contract bindings live behind the separate `@facilpay/sdk/contracts`
// entry point so REST-only consumers never pull in `@stellar/stellar-sdk`.
// The contracts entry point is resolved via the package `exports` map and is
// intentionally NOT re-exported here.

export default FacilPay;
