# frontend changes — 2026-07-12

everything below is **frontend only**. the backend (convex functions, worker, contracts) was not touched — the ui still talks to the exact same api: `bootstrap`, `listProjects`, `createConversation`, `sendMessage`, `getConversation`.

## the big picture

the ui was rebuilt to match the waitlist/demo look (localhost:4173): dark pixel-art "company" workspace, press start 2p + dm sans, lime accent, two rounded panels — big workspace on the left, command panel on the right. all display text is lowercase (enforced with css `text-transform: lowercase`, so backend data also displays lowercase without being changed).

## files touched

- `frontend/src/App.tsx` — full rewrite of the ui (same convex wiring/data as before)
- `frontend/src/styles.css` — full rewrite in the waitlist visual language
- `frontend/index.html` — proper html head, lowercase title, founder favicon
- `frontend/vite.config.ts` — removed dead `publicDir: ../../demo/public` (earlier fix; this is why images were broken)
- `frontend/public/agents/*.png` — the four agent portraits copied from the waitlist project (earlier fix)

## left workspace (4 views, toggle top-left)

1. **company map** — founder in the center, market intel / page builder / distribution around the orbit. dashed trace lines connect founder to each specialist; when founder hands work over, the line animates lime; when a specialist finishes, the line turns cyan. status dots on every portrait are live from convex runs.
2. **the team** — employee cards with live status and a plain-language line of what each agent is doing right now (thinking line while working, its real summary when done).
3. **task tracker** — every agent run is a task row (who, what, when, state chip). click a task → a drawer opens with what the agent says (its real summary), a timeline (started / finished / took / assigned by), and everything it made — each output opens in a full reader. failed tasks show the error in plain words. below the list: a "what just happened" live event ledger.
4. **finished work** — all artifacts as cards; the landing-page preview card opens the live cloudflare page directly.

## right command panel (home / results / settings nav, like the 4173 build)

- **home** — the founder chat. everyone talks in one thread now: your messages, founder, and the specialists' real responses, each with their portrait. when founder delegates, a handoff bubble appears ("okay research — take over this one…") and a working indicator shows what each busy agent is thinking. active tasks sit pinned above the chat, clickable into the task drawer. empty state = founder introducing itself with three ready-made mission presets.
- **results** — three sub-tabs:
  - **proof**: every trace as a rail card (agent, real summary, timing) + event ledger. click → task drawer.
  - **evals**: a live scorecard of 6 checks (founder understood the idea, research cited sources, landing page written, launch plan drafted, final answer delivered, zero failed tasks) computed from the stored mission record — works even with no data (shows "not yet"/"working"). "open the full eval report (markdown)" generates a markdown report in the reader, fully client-side, no backend needed.
  - **landing**: the live landing page embedded in an iframe with an "open the live page" button, plus the landing brief documents. empty state has a one-click "build my landing page" button.
- **settings** — plain-language: current company, switch company, start a new idea, missions in this company (click to reopen), a 3-step "how this works", and a "your work is safe" note.

clicking any agent on the map/team opens its **employee file** in the right panel (bio, what it's doing right now, tasks run, recent tasks → task drawer), with a back-to-chat button.

## round 2 — chat notches + in-app website (same day)

- **short updates, not essays**: long agent messages in the chat are now clamped to ~6 lines with a "read everything" toggle. under each specialist/founder message there's a **notch row**: chips for every file that task produced (click → opens the reader), a "view the website" chip when landing shipped a page, and a "how i did it" chip that opens the full task drawer.
- **website opens inside the app**: a new site viewer modal with a browser-style header. it renders the page from the stored `landing_page_html` artifact (srcdoc), so it always displays — no dependence on the live url allowing embedding. "open live" button goes to the real cloudflare page.
- **no more broken grey iframe**: results › landing no longer auto-embeds the live url. it shows a styled placeholder site card (browser chrome + page title); clicking it opens the site viewer. if a page can't render, the viewer's footer explains and points to "open live".

## known limits / notes

- founder's *question quality* ("ask very detailed questions") lives in the backend hermes prompts (`backend/src/prompts.ts`), not the ui — untouched per your instruction. say the word and i'll upgrade the interview prompt next.
- the eval checks are computed in the browser from runs/artifacts; when you later add real evals to the backend, the results tab is the natural place to render them.
- verification created a throwaway company named **"ui smoke test"** in your convex deployment (no messages were sent, so nothing was queued for the vps worker). safe to ignore or delete.
- typecheck and production build pass; ui verified with headless-browser screenshots of onboarding, home, map, team, tasks, results (proof/evals/report), and settings.
