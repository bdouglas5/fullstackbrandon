# Website agent handoff: publish FullStackBrandon

Prepared October 5, 2026. This document is a deployment brief, not evidence of a completed deployment.

## Requested outcome

Host the playable FullStackBrandon / Little Worlds simulation as a portfolio piece. Connect its GitHub repository to automatic production deployments so successful releases on `main` update the public game without manual uploads. Add a polished portfolio entry and a prominent “Play simulation” link on Brandon's existing website.

Repository: https://github.com/bdouglas5/fullstackbrandon

Local checkout: `/Users/bdouglas/Library/Mobile Documents/com~apple~CloudDocs/Documents/Coding/FullStackBrandon`

Use the website's actual domain and existing design conventions. An example game address is `play.<portfolio-domain>`; replace all placeholders before launch. The portfolio itself can remain with its existing host.

## Architecture you must preserve

- React + Three.js render the interactive world in the browser.
- A long-running Node/Express process owns the simulation and streams state over server-sent events (SSE).
- SQLite stores guest worlds, replay history, checkpoints, and usage.
- Deploy exactly one application instance/process with persistent disk storage. Multiple replicas and ephemeral/serverless storage are incompatible with the current coordinator and database design.
- The frontend and `/api` should share the game origin. Frontend requests use relative `/api` paths.
- Optional Jev credentials stay on the server. The game works without a provider key, using its labeled rules controller.

GitHub Pages alone cannot host this full application. A conventional static/serverless frontend deployment alone is also insufficient. Do not rewrite the backend merely to fit the portfolio's hosting provider.

## Suggested hosting: Render native Node web service

Connect the repository to a **paid web service with a persistent disk**. Choose a service size after observing actual memory/CPU use; do not promise an unverified price or capacity.

| Setting | Value |
| --- | --- |
| Repository | `bdouglas5/fullstackbrandon` |
| Production branch | `main` |
| Runtime | Node |
| Root directory | Repository root |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/api/health` |
| Instance count | 1 |
| Persistent disk mount | `/var/data` |
| Automatic deployment | Enable for successful production releases; preferably after CI passes |

Configure environment variables in the host dashboard:

```dotenv
NODE_VERSION=22.23.3
NODE_ENV=production
HOST=0.0.0.0
PUBLIC_ORIGIN=https://play.<portfolio-domain>
DATABASE_PATH=/var/data/little-worlds.sqlite
MAX_ACTIVE_RUNS=30
```

`22.23.3` is the version recorded in this repo's deployment guide and Dockerfile; verify its availability and use a supported compatible patch if necessary. The app requires Node 22.13+ and uses built-in `node:sqlite`. Let the host supply `PORT`.

`PUBLIC_ORIGIN` must be the exact game origin, without a trailing slash or path. Before the custom domain is ready, use the service's actual HTTPS origin and update it when switching domains. Redirect alternate addresses to the canonical game domain so mutation requests use the configured origin.

Optional server variables: `TYPESAFE_API_KEY`, `JEV_MODEL=jev-1.13.0`, `JEV_DAILY_TOKENS=1000000`, and `JEV_SESSION_CALLS=80`. Leave the key absent for a rules-only launch, and describe that mode accurately. To advertise live AI decisions, verify actual successful provider calls first. Never put secrets in `VITE_*`, Git, frontend code, screenshots, or this document.

The build runs a model exporter through `prebuild`; it needs development dependencies. Mount storage at runtime and confirm SQLite can create/write files there. Persistent disks cause a brief interruption during Render redeploys; saved runs should resume as paused after restart. Do not promise uninterrupted live sessions across updates.

Current provider references:

- [Express deployment and GitHub automatic deployment](https://render.com/docs/deploy-node-express-app)
- [Persistent disks, paid service requirement, and deployment limitations](https://render.com/docs/disks)
- [Node version configuration](https://render.com/docs/node-version)
- [Deployment controls](https://render.com/docs/deploys)

## Add it to the website

Default: create a portfolio project section/card with a screenshot, short description, “Play simulation” button to the canonical game URL, and a “View source” link to GitHub. Let visitors open the full game with enough space for its controls.

Suggested copy:

> **Little Worlds — an interactive business simulation**
> Explore a miniature 3D world where Brandon builds a pickle business. Watch deliveries, change the weather, disrupt his plans, and inspect the decisions behind the simulation. Built with React, Three.js, Node.js, and SQLite.

Available supporting material: `docs/CASE_STUDY.md`, `docs/ARCHITECTURE.md`, and selected images in `docs/images/`. Choose a screenshot that matches the deployed release and avoid overstating test or AI claims.

### If an inline iframe is required

Embedding needs an explicit application change. `server/index.js` currently sends `X-Frame-Options: DENY` and a production CSP containing `frame-ancestors 'none'`.

Allow only the exact portfolio HTTPS origin(s) in `frame-ancestors` and remove the conflicting DENY header for the game response. Preserve the remaining CSP restrictions. Update the parent site's CSP `frame-src` if it restricts frames. Test controls, resize, fullscreen, keyboard focus, SSE, and guest persistence in the actual iframe.

Guest ownership uses an HttpOnly `SameSite=Strict` cookie. A game subdomain under the same HTTPS registrable domain is preferable; unrelated-domain embedding may fail because of cookie restrictions. Do not weaken session cookies to bypass this without reviewing and verifying the whole session flow. Keep a full-page “Open simulation” link available.

## GitHub release workflow

1. Review and commit intended simulation changes to GitHub. Local edits are not deployed until pushed. This checkout had ongoing uncommitted motion-related work when this handoff was written; coordinate with the simulation agent rather than bundling it into website work.
2. Use feature branches/PRs for development and make `main` the production release branch.
3. Run existing CI (`.github/workflows/verify.yml`). Configure production deployment to follow passing checks where supported, and protect `main` appropriately.
4. On a successful production release, the host builds and redeploys the same game URL. The portfolio's link continues to work without a new portfolio deployment.
5. Confirm auto-deployment with a small deliberate release. Record the deployed commit SHA and compare it with the intended GitHub commit.

Updates reach new loads after deployment; an already-open game may need a refresh. Keep visitor data on the mounted disk across releases. Schema changes require a backup/migration plan; code rollback alone does not guarantee database compatibility.

## Existing deployment details and a container caveat

Read `docs/DEPLOYMENT.md`, `.env.example`, `server/index.js`, and `server/store.js` before making host-specific changes. Existing Docker files are `Dockerfile` and `compose.yaml`.

The Dockerfile currently calls `npm run build` without copying `scripts/` into the build stage. Because `prebuild` invokes `scripts/export-models.js`, container deployment needs that COPY step fixed and an actual image build verified. The native Node path above avoids that Dockerfile issue. This handoff does not modify or validate the container.

Behind a proxy, preserve SSE streaming without buffering or caching and allow long-lived connections. The server emits heartbeat comments every 15 seconds. Verify proxy behavior and rate limiting: current request limits use `req.socket.remoteAddress`, so visitors behind one proxy can share an allowance. Do not blindly enable trust for arbitrary forwarded headers.

## Launch acceptance

- Run `npm test` and relevant Playwright flows against the exact release. Record failures honestly; historical results do not certify a new deployment.
- Confirm the final HTTPS domain, certificate, canonical redirects, and portfolio links.
- `/api/health` returns a successful response with database connectivity and simulation version.
- In a fresh browser, create a guest world, press Play, observe real deliveries and state updates, and exercise controls.
- Refresh and confirm saved progress. Restart/redeploy and confirm the same visitor's saved world survives and returns paused.
- Use two independent browser sessions and confirm their worlds are isolated.
- Verify SSE remains connected during a sustained session, with no proxy buffering or API cache interference.
- Check desktop and a real phone: layout, loading, camera/input, usable frame rate, weather/day/night, and reduced motion.
- Confirm secrets, database files, backups, and source files are not served publicly.
- Run `npm run backup` with the correct production database path; copy the SQLite-consistent backup to protected storage outside the instance and test restore on a disposable database. Follow `docs/DEPLOYMENT.md` for recovery.
- If Jev is enabled, verify successful live decisions and visible fallback behavior; otherwise disclose rules mode accurately.
- Verify one GitHub-triggered update reaches production and the portfolio still opens the game.

## Return to Brandon

Provide the live game URL, portfolio URL, hosting service identity, production branch, deployed commit SHA, auto-deploy configuration, disk/database path, backup location, actual recurring cost, and results of the public browser checks. State any remaining blocker explicitly.

No hosting account, service, DNS record, deployment, iframe change, or website edit was created as part of preparing this file.
