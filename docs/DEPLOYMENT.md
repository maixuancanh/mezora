# Deploying Mezora

Checked 23 October 2026. A dedicated free Neon PostgreSQL resource has been
provisioned and connected to the new Mezora Vercel project. These files prepare
deployment; no public web deployment was performed by this preparation step.
Existing local Anvil evidence does not establish Mezo testnet execution.

## Choose the runtime

| Runtime | Durable data | Receipt processing | Current readiness |
| --- | --- | --- | --- |
| Docker Compose on a host you control | PostgreSQL named volume | Separate worker, every 10 seconds | Configuration validated; image/startup still needs Docker engine |
| Vercel + dedicated external PostgreSQL | Managed PostgreSQL | On demand during authenticated workspace reads/actions | Project/database connected; needs remaining environment configuration and hosted verification |
| Local development | PGlite local directory | On demand | Local only |

Hosted production must require a `postgres://` or `postgresql://` `DATABASE_URL`.
PGlite on a function's filesystem does not provide shared durable storage across
invocations. Do not set `MEZORA_DATA_DIR` to `/tmp` as a deployment workaround.

## Docker: web + PostgreSQL + worker

Run commands from the repository root. Copy `.env.example` to a private `.env` and
add `POSTGRES_PASSWORD` using a freshly generated URL-safe password (for example,
64 random hexadecimal characters). Compose constructs its internal `DATABASE_URL`
from this value; the database is not exposed on a host port.

Set `MEZORA_ORIGIN=http://127.0.0.1:3210` for local Docker. For a hosted container,
set it to the exact public HTTPS origin and put a TLS reverse proxy in front of
the loopback-bound published port. Wallet challenge and POST origin validation
must agree with the browser's origin. Production cookies require HTTPS; a local
HTTP production container does not validate the authenticated browser flow.

```powershell
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail 100 web worker
```

The image uses Node 22 and the committed npm lockfile. It includes the TypeScript
runtime needed by the worker. The web command explicitly binds `0.0.0.0` inside
the container; the normal workspace `npm start` command binds loopback. The
worker reads chain state and updates receipt records in SQL; it has no signing
key. Web and worker use the same database and chain configuration.

`postgres-data` survives container replacement and ordinary `docker compose down`.
Do not use `docker compose down -v` when retaining data. Changing the password in
`.env` does not change the password inside an initialized PostgreSQL volume;
rotate it in PostgreSQL and update the application together. Back up PostgreSQL
to private storage before upgrades; a Docker volume alone is not a backup.

Before an unattended hosted container release, record image digests and validate
restore, restart recovery, and the authenticated HTTPS flow on the actual host.
The web healthcheck checks HTTP availability, not a settled chain payment.

## Vercel + PostgreSQL

The new Vercel project is `mezora` / `prj_HNv5rZK2dq312Fwqfrk2aW946HrZ` in team
`team_WM0j8i0DhVE3dSBIrK1rHgC2`. Its Root Directory is `apps/web`, framework
Next.js, Node 24, region `sin1`, install command `cd ../.. && npm ci`, and build
command `cd ../.. && npm run build`. Use the Next.js output default `.next` and
allow files outside the app directory for workspace imports. Do not deploy the
surrounding `D:/bitgethackathon` workspace. The supplied root `vercel.json` sets
only the framework; app-root project settings control commands and output.
The first hosted build must validate Vercel's Next.js adapter and route packaging;
local `next build` alone does not prove that.

Use a dedicated PostgreSQL database and a TLS connection URL. This app uses `pg`
transactions and row locks; Redis and Turso are not drop-in database replacements.
For Neon, use its pooled PostgreSQL URL as `DATABASE_URL`; preserve the provider's
TLS settings. Store credentials as server-only Vercel environment variables,
with separate preview/production databases before receiving real user data. The
initial validation setup connects production and preview to the same dedicated
Mezora database. Do not expose credentials through
`NEXT_PUBLIC_*`, build output, Git, or browser code.

Set at least:

- `DATABASE_URL`: dedicated durable PostgreSQL connection.
- `MEZORA_ORIGIN`: exact canonical HTTPS deployment origin. Set separately for
  preview environments; arbitrary preview aliases will fail origin validation.
- `MEZO_RPC_URL`: verified Mezo testnet RPC, chain 31611.
- `MUSD_ADDRESS`: verified MUSD token when overriding the official default.
- `MEZORA_CONFIRMATIONS`: confirmation policy verified for the selected network.
- Treasury address/deployment block where using server configuration; owner
  setup must persist any per-owner treasury configuration in the same database.

No private signing key is needed by the web app or receipt worker. Configure a
stable origin before wallet sign-in verification. After setting environments,
build a preview, inspect it, then verify owner authentication, isolated data,
persisted bills after a redeploy, contract setup, and recovery of pending receipts.
Only actual testnet receipts establish live chain integration.

### Confirmed free database path

Read-only Vercel discovery for team
`team_WM0j8i0DhVE3dSBIrK1rHgC2` / `vancongabc955-5514s-projects` returned Neon plan
`free_v3`: Free, no payment method required, 1 GB per project and 100 CU-hours per
project. Existing integrations were Turso and Upstash; Neon was not installed.
The newly provisioned resource is `mezora-postgres` /
`store_RzykU8UhBi8ApPCb`, external resource `gentle-grass-39501669`, installation
`icfg_Em5qzzkTwed6NeYlBzXOoKRh`, on plan `free_v3`. It is connected only to the
Mezora project, for production and preview.
[Neon pricing](https://neon.com/pricing) and
[Vercel Marketplace Neon](https://vercel.com/marketplace/neon) document this path.

The first attempt stopped at required Neon terms acceptance. After the user
explicitly confirmed acceptance, this exact command succeeded for a fresh
Singapore database with built-in Neon Auth disabled. This is a provisioning
record; **do not rerun it for the existing resource**:

```powershell
vercel integration add neon --name mezora-postgres --plan free_v3 --metadata region=sin1 --metadata auth=false --no-connect --no-env-pull --format=json --scope vancongabc955-5514s-projects --non-interactive
```

The integration injected encrypted environment variables into the verified
Mezora project. Only its `DATABASE_URL` was saved locally to
`.env.deployment.local`, with a current-user-only Windows ACL; Git ignore was
verified. No existing project's credentials were reused. Free quotas are
bounded; no always-on worker hosting is included in this database plan.

### Worker and cron behavior on Vercel

The current Vercel app reconciles receipts on demand. Persisted SQL intents allow
later requests to resume reconciliation, including after a function restart.
The Node worker's infinite loop is not run as a Vercel Function. Run `npm run
worker` on a persistent Node/container host with the same PostgreSQL and network
configuration if background updates are required while the UI is closed.

No cron is enabled in `vercel.json`: there is currently no dedicated authenticated
cron endpoint, and the session-dependent workspace API cannot be used as one.
Do not claim unattended background processing on the Vercel-only path. A future
cron endpoint must authenticate scheduled calls, iterate persisted workspaces,
bound each run's backfill work, and safely tolerate overlapping calls.
[Vercel's current cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
allow only daily Hobby executions, so Hobby cron cannot replace a 10-second
worker. An always-running poller also consumes a free database's compute quota.

## Preparation evidence and remaining work

- `docker compose config --quiet` passed with a temporary validation password.
- `vercel.json` parsed as JSON. No hosted build was performed in this step.
- Docker CLI is installed, but the Linux engine pipe is unavailable. Image build,
  PostgreSQL startup, container networking, and worker restart have not been run.
- Neon free-plan availability was checked via the connected Vercel API. Following
  user acceptance of provider terms, the dedicated resource was provisioned and
  connected. No credentials were read from other projects.
- A `pg` client loaded the private deployment environment and successfully ran
  `SELECT 1` against the dedicated PostgreSQL database. This proves SQL
  connectivity; it does not prove the deployed app's schema/workflow behavior.
- Complete hosted build, production origin configuration, durable SQL workflow
  verification and testnet transaction evidence before claiming a
  deployment is ready for users.

References: [Vercel storage](https://vercel.com/docs/storage),
[Vercel monorepos](https://vercel.com/docs/monorepos),
[Vercel project configuration](https://vercel.com/docs/project-configuration).
