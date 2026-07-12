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
