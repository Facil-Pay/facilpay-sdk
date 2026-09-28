# Express QR Checkout

Creates a test payment, displays its PNG QR code, and verifies FacilPay webhook signatures against the untouched request body.

## Run

Start a local `facilpay-api` on port 4000, then configure the API key and webhook secret:

```sh
cp .env.example .env
# Edit .env with an fp_test_ API key and the endpoint's whsec_ secret.
npm install
npm run dev
```

Open <http://localhost:3001>. The page creates a new USD 19.99 test payment and renders its QR code. Configure your local API to deliver webhooks to `http://localhost:3001/webhooks/facilpay`.

The webhook route is registered before `express.json()` and uses `express.raw({ type: 'application/json' })`. Signature verification must receive `req.body` as a `Buffer`, not parsed JSON.