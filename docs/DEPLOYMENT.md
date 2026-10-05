# Local use and production preparation

## Local game

Requires Node.js 22.13 or newer (tested with 22.23.3).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. On macOS, `start-local.command` installs missing dependencies, starts the server, and opens the game. Leave its terminal running.

The game works without a provider key using a clearly labeled rules controller. Copy `.env.example` to `.env` and set `TYPESAFE_API_KEY` locally to enable Jev; restart the server. Never put the key in a `VITE_` variable, the browser, source control, or a chat message. The application does not offer an arbitrary provider proxy.

The first visit creates a private guest session. A random, HttpOnly, SameSite=Strict cookie identifies it. Runs persist in SQLite. A refresh resumes the latest saved mission; after a server restart, previously running missions restore as paused. No browser credentials or provider keys are included in exported evidence.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run evaluate
npm run models
```

`npm test` builds the production frontend first, then checks simulation invariants, provider boundaries, and the production HTTP API. Browser tests launch a separate production server on port 4080 with accelerated simulation time and an isolated database. The evaluator runs eight rules-based careers: seeds 0, 7, 42, and 99, each with and without disruptions. It writes outcomes to `evidence/career-evaluation.json`.

Mock-provider tests verify integration handling, not live Jev performance. Live verification requires a configured key and recorded successful decisions from TypeSafe. Browser emulation does not replace a real phone or human enjoyment test.

## Production build without Docker

```sh
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 PUBLIC_ORIGIN=http://localhost:3000 npm start
```

Use the actual HTTPS origin in production. Configure environment variables through the hosting provider's secret/environment system. Serve through a TLS reverse proxy. Forward server-sent event connections without buffering and allow connections longer than 15 seconds. The server sends heartbeat comments every 15 seconds.

Production serves only the built `dist` directory plus explicit API routes; `.env`, SQLite, and source files are not web-accessible. Fonts are self-hosted and no analytics or advertising scripts are included.

## Container release

```sh
# Set PUBLIC_ORIGIN and optional TYPESAFE_API_KEY in your environment or local .env.
docker compose up --build -d
```

The Dockerfile builds frontend assets, installs runtime dependencies, runs as the non-root `node` user, exposes a health check, and stores the database on the `world-data` volume. Compose binds to localhost so a reverse proxy can own public TLS. Configure the proxy separately for your chosen host and domain.

**Deploy one application instance with one persistent disk.** The simulation coordinator and in-flight request reservations are owned by one Node process. Do not run multiple replicas against this SQLite file or deploy to an ephemeral/serverless filesystem. Horizontal scaling requires moving run ownership and usage reservations to a shared transactional service, not simply increasing replica count.

A VPS or container host with persistent storage is the intended initial deployment. No hosting account, domain, or paid service has been created by this project.

## Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| PORT | HTTP port | 3000 |
| HOST | Bind address | 127.0.0.1; container sets 0.0.0.0 |
| PUBLIC_ORIGIN | Exact browser origin allowed for mutations; required in production | http://localhost:3000 in development |
| DATABASE_PATH | SQLite path on persistent storage | ./data/little-worlds.sqlite |
| TYPESAFE_API_KEY | Private TypeSafe credential | Empty: rules mode |
| JEV_MODEL | Pinned model identifier | jev-1.13.0 |
| JEV_DAILY_TOKENS | Shared daily input-token allowance | 1000000 |
| JEV_SESSION_CALLS | Maximum requests per retained guest session | 80 |
| MAX_ACTIVE_RUNS | In-memory run capacity | 30 |
| TICK_MS | Wall-clock milliseconds per simulation second | 750; tests accelerate it |

The server reserves 4096 input tokens synchronously before each provider request and reconciles valid reported usage. Failed requests retain the reservation. Calls are bounded, use fixed application-defined inputs and choices, and time out after five seconds. Low-confidence, invalid, failed, or over-budget calls visibly use the rules fallback. Session limits persist across refreshing the page; deleting cookies starts another identity, so the global daily allowance is the final cost control. Set a provider-side spending limit too if the account supports one.

Mutations require the application header and enforce the configured Origin. Runs are scoped to the guest session for reads, writes, export, replay, and branching. The application does not trust forwarded IP headers; a shared reverse proxy therefore shares the network request allowance. Revisit proxy trust and rate-limit configuration with the actual hosting topology before launch.

## Operations and recovery

- `/api/health` verifies database connectivity and exposes the simulation version.
- SIGTERM/SIGINT saves active runs as paused and closes event streams.
- Runs with no connected browser or recent interaction pause after 30 seconds.
- Up to 1000 runs are retained globally; further creation fails gracefully at that cap. Sessions inactive for seven days and their runs are removed during cleanup. Usage entries older than seven days are removed too.
- `npm run backup` uses SQLite's backup API for a consistent backup while the service is running. Protect backups like the live database.
- To restore: stop the application, preserve the current database and its WAL/SHM files separately, place the chosen backup at DATABASE_PATH, remove obsolete WAL/SHM sidecars from the restored location, then restart. Never replace a live database in place.
- Roll back application code together with a compatible database backup if the schema changes. This initial schema uses `CREATE TABLE IF NOT EXISTS` and a guarded addition of the session’s selected-run column; future incompatible schema changes need explicit versioned migrations.

## Before public posting

1. Configure Jev and verify live successful decisions and fallback behavior.
2. Configure any desired résumé and contact links in the portfolio interface. The public source repository is [bdouglas5/fullstackbrandon](https://github.com/bdouglas5/fullstackbrandon).
3. Choose the host and domain, set the HTTPS origin, provision persistent storage, and test the proxy's event streaming.
4. Run the checks on the actual release, verify restore on a disposable database, and exercise the public deployment from a separate browser session and phone.
5. Playtest mission clarity and enjoyment with a person; record feedback rather than claiming automated tests prove fun.

The local production build can be verified without publishing. Docker configuration is provided; report an actual image build separately from a configuration review.
