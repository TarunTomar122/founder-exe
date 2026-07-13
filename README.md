# Founder.exe runtime

The original `demo/` and `waitlist/` directories are independent frontend experiments. This workspace is the new product runtime.

```text
frontend/                 Founder chat and mission UI
backend/convex/           durable state: conversations, agent runs, artifacts, events
backend/src/              Hermes worker and HTTP service
packages/contracts/       shared Zod contracts
```

## Validation workflow

- **Founder** is the only user-facing agent. It asks for missing product/audience context, explains decisions, routes revision requests, and owns both approval gates.
- **Research** produces a structured evidence dossier, exposed market-size math, competitor field, signals, assumptions, and community constraints.
- **Go-to-Market** peer-reviews Research, then produces a measurable validation campaign and safe platform-native drafts after research approval.
- **Landing Page** consumes the approved dossier and reviewed campaign, adapts one approved template, and deploys a stable Cloudflare waitlist page.

Research reviews GTM. Research and GTM both review the landing page. Material findings automatically create a replacement artifact for up to five rounds. Every prompt, response, handoff, duration, token record, review, artifact version, approval, event, and lead is stored in Convex and can be exported from the Team workspace.

Convex is the audit log and source of truth. The worker does not directly mutate the database: Convex dispatches a signed command, the worker executes Hermes, then it sends a signed result to Convex for validation and storage.

## Local startup

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`.
2. From this directory, run `npm install`.
3. Create/select a Convex deployment with `npm run dev:convex`, then set both its cloud and site URLs.
4. Start the worker with `npm run dev:backend` and the UI with `npm run dev:frontend`.

`TEMPLATE_LIBRARY_PATH` is intentionally required by the Landing Page agent. Point it at the approved VPS template/prompt directory before enabling that agent in production.

The frontend can run on any laptop because it talks directly to hosted Convex. Hermes and Cloudflare preview deployment still happen in the long-running worker, so keep that worker running on the configured VPS. The worker health check is `GET http://127.0.0.1:8788/health`.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Landing pages send attributed view, CTA, form-start, and waitlist events to the public Convex HTTP routes. Generated scripts cannot make arbitrary network requests; the worker sanitizes model HTML and injects the trusted validation runtime after review.

## Billing and voice

Billing is temporarily frontend-only. Set `VITE_DODO_CHECKOUT_URL` in `frontend/.env.local` to a Dodo hosted payment link whose return URL includes `?checkout=success`. The first project is free, and Builder unlocks more usage for $9/month on the current browser.

Internal mode is enabled automatically in local development. In a deployed build, open the app once with `?internal=1` to reveal the billing bypass on that browser. The bypass and Builder state are stored in local storage.

Agent replies use the browser's built-in speech engine, so voice playback needs no backend key.
