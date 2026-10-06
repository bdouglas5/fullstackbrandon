# Portfolio browser edition

The portfolio build runs the existing `shared/engine.js` inside a Web Worker.
There is no game server, account, provider key, or paid persistent disk. Rules
make the decisions; Three.js renders the same world and controls. The original
server edition remains available through `npm start` and `npm run build`.

## Local and production builds

- `npm run dev:browser`: browser-only development.
- `npm run test:browser-engine`: shared gameplay and rendering helper checks.
- `npm run test:browser`: worker runtime checks against the actual engine.
- `npm run build:browser`: model export and static browser bundle in `dist`.
- `npx playwright test --config playwright.browser.config.js`: static-preview
  checks for starting, weather, reload, replay, independent visits, and phone layout.

`vercel.json` makes Vercel run the worker checks before building the static
edition. Connect `bdouglas5/fullstackbrandon`, production branch `main`, to the
`little-worlds-brandon` Vercel project. Main releases update the same public game
address; other branches get previews. The portfolio's full-page Play link stays
stable. No Render service is required.

## One-time visitor behavior

The introduction is the only entry step. A new tab/visit gets a fresh world,
while refreshing that tab preserves its own visit via sessionStorage and
IndexedDB. Separate visitors and independent tabs have separate worlds. Hidden
pages pause to protect phone battery and avoid unexpected progress; returning
shows Resume. Controls, purchases, deliveries, inspector, weather, replay,
legal decision branches, parent selection, achievements, and JSON export use the
same engine and run locally. Large candidate traces are kept in the current
state and decision checkpoints; replay frames retain outcomes without duplicate
candidate traces. Replay and old career storage are bounded. Old visits can be
removed after a day. Browser storage is best-effort; an actual storage failure
shows a message while allowing in-memory play.

The browser edition does not make live Jev provider calls. API keys cannot be
included in a public static bundle. Existing server and AI tests remain available through `npm test` and the manual
server workflow for the separate server edition; the browser release has its own runtime and
static-host verification.
