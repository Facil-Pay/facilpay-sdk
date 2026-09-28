# Next.js App Router

This example uses a Next.js 16 server action to create a payment and an App Router webhook handler to verify deliveries before processing them.

## Run

Start a local `facilpay-api` on port 4000 and configure a test API key and webhook secret:

```sh
cp .env.example .env.local
# Edit .env.local with an fp_test_ API key and the endpoint's whsec_ secret.
npm install
npm run dev
```

Open <http://localhost:3000>. The form submits to a server action, which creates the payment without exposing the API key to the browser. Configure the API webhook URL as `http://localhost:3000/api/webhooks/facilpay`.

The route handler calls `await req.text()` and passes that exact string to `Webhooks.constructEvent()` before handling the event. Do not parse or reserialize the body before signature verification.