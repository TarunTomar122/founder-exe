# Founder.exe runtime

The original `demo/` and `waitlist/` directories are independent frontend experiments. This workspace is the new product runtime.

```text
frontend/                 Founder chat and mission UI
backend/convex/           durable state: conversations, agent runs, artifacts, events
backend/src/              Hermes worker and HTTP service
packages/contracts/       shared Zod contracts
```

## Initial agents

- **Founder** — user-facing orchestrator. It decides which specialist(s) to delegate to and owns the final response.
- **Research** — competitor and market analysis with cited artifacts.
- **Landing Page** — produces a bounded landing-page brief and template-aware implementation artifact.
- **Go-to-Market** — produces a launch strategy and platform-specific posts.

Convex is the audit log and source of truth. The worker does not directly mutate the database: Convex dispatches a signed command, the worker executes Hermes, then it sends a signed result to Convex for validation and storage.

## Local startup

1. Copy `.env.example` values to `backend/.env` and `frontend/.env.local`.
2. From this directory, run `npm install`.
3. Create/select a Convex deployment with `npm run dev:convex`, then set `CONVEX_URL` and `VITE_CONVEX_URL`.
4. Start the worker with `npm run dev:backend` and the UI with `npm run dev:frontend`.

`TEMPLATE_LIBRARY_PATH` is intentionally required by the Landing Page agent. Point it at the approved VPS template/prompt directory before enabling that agent in production.

## Billing

Each browser identity can create one project for free. A Builder subscription is $9/month and permits five new projects per UTC calendar month. Project creation is checked inside Convex; the frontend gate is only the user interface.

Create a recurring monthly product in Dodo Payments Test Mode, then configure the hosted Convex deployment:

```sh
cd backend
npx convex env set DODO_PAYMENTS_API_KEY
npx convex env set DODO_PAYMENTS_PRODUCT_ID
npx convex env set DODO_PAYMENTS_WEBHOOK_KEY
npx convex env set DODO_PAYMENTS_ENVIRONMENT test_mode
```

Point the Dodo webhook at `https://YOUR_DEPLOYMENT.convex.site/billing/dodo` and subscribe to the subscription lifecycle events. The route verifies Standard Webhooks signatures and uses the checkout metadata to associate the subscription with the current browser owner key.

For an internal test browser, set `BILLING_BYPASS_OWNER_KEYS` to its `localStorage.getItem("founder.ownerKey")` value. A wildcard is accepted only outside Dodo live mode:

```sh
npx convex env set BILLING_BYPASS_OWNER_KEYS '*'
```
