import { FacilPay } from './client';
import { FacilPayError } from './core/errors';
import { VERSION } from './core/version';

export { FacilPay, FacilPayError, VERSION };
export type { FacilPayOptions, Environment } from './client';

export default FacilPay;
