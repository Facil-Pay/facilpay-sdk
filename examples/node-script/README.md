# Node.js Payment Listing

Lists payments across all pages using the SDK's async iterator.

## Run

Start a local `facilpay-api` on port 4000, then configure an `fp_test_` key:

```sh
cp .env.example .env
# Edit .env with your fp_test_ API key.
npm install
npm run dev
```

The script streams each payment as it is read, so it does not need to collect every page in memory.