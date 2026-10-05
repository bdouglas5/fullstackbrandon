# Render release configuration

`render.yaml` defines a native Node web service, one application instance, and a
1 GB persistent disk mounted at `/var/data`. It deploys `main` after GitHub CI
passes. The compute plan is an initial proposal, not an observed capacity or
approved recurring expense; confirm current compute and disk pricing in Render
before creating the service.

The build installs development dependencies because the model exporter runs
before Vite. Runtime uses Node 22.23.3, production mode and the port supplied by
Render. SQLite lives at `/var/data/little-worlds.sqlite`.

Initially the start command uses Render's `RENDER_EXTERNAL_URL` as the exact
mutation origin. After configuring and verifying `play.douglasvisuals.com`, set
`PUBLIC_ORIGIN=https://play.douglasvisuals.com` and disable Render-subdomain access
or redirect it at the application proxy. Do not link visitors to an alternate
origin that the mutation guard rejects. The portfolio remains on Vercel and links
to the game in a full page; embedding is not enabled.

No provider key is included. The launch uses the rules controller. Jev can be
enabled later through Render's private environment settings only after successful
provider calls are verified.

Before promoting a release, run the checks in [DEPLOYMENT.md](DEPLOYMENT.md) and
the public launch acceptance in [WEBSITE_AGENT_HANDOFF.md](WEBSITE_AGENT_HANDOFF.md)
if that brief is available. Verify guest isolation, refresh and restart
persistence, sustained SSE streaming and backups on the actual host. The current
rate limiter uses the socket address; assess Render's proxy topology before
advertising capacity. Do not trust arbitrary forwarded headers.

Disks interrupt service briefly during redeploys. Saved worlds should restore
paused. Run `DATABASE_PATH=/var/data/little-worlds.sqlite npm run backup`, then copy
the generated backup out of the instance to protected storage and test a restore
on a disposable database. Backups generated under `data/backups` are not offsite
backups and must be exported before a redeploy.

Creating this configuration does not create a Render service, DNS record,
backup schedule or live deployment. Record the actual service identity, pricing,
deployed commit and acceptance results when provisioning is complete.
