# INRP2P production runbook

The fastest supported path is Vercel plus a managed PostgreSQL database with
point-in-time recovery. A Node 20+ container or VPS also works.

## 1. Provision isolated environments

Create separate PostgreSQL databases and credentials for staging and production.
Use pooled `DATABASE_URL` for the application and a direct
`DATABASE_URL_UNPOOLED` for migrations. Enable automated backups before loading
real data and complete one restore drill.

## 2. Configure secrets

Copy every required value from `.env.example` into the deployment platform's
encrypted environment-variable store. Do not upload a populated `.env` file.

Required for a real beta:

- database URLs;
- canonical site URL and public contact values;
- Resend API key plus a verified `EMAIL_FROM` domain;
- Cloudflare Turnstile site and secret keys;
- strong admin seed credentials;
- a random `CRON_SECRET` for scheduled maintenance;
- a private S3/KMS evidence vault before evidence collection.
- a base64 32-byte `PROCESSING_DATA_KEY` before enabling merchant processing. Store and
  back it up as a long-lived encryption key; do not replace it during ordinary deploys.

Provider, messaging, fee-collection and operator-AI integrations are optional.
Unconfigured verification providers explicitly fall back to manual review. Core
matching and routing are deterministic and do not need an AI key.

## 3. Validate the release

Run against staging configuration:

```bash
npm ci
npm run db:validate
npm run lint
npm run typecheck
npm test
npm run build
```

Then deploy migrations:

```bash
npm run db:deploy
```

For a legacy database, follow the baseline procedure in `README.md`; do not mark
a migration applied unless its schema is already present.

## 4. Create the operator

Run once with credentials supplied from a password manager:

```bash
ADMIN_EMAIL='operator@example.com' \
ADMIN_PASSWORD='a-long-unique-password' \
ADMIN_NAME='Network Operator' \
npm run db:seed
```

The seed rejects missing or weak values and never prints the password. Remove seed
credentials from the runtime environment after the account is created.

## 5. Deploy and smoke-test

Deploy the immutable release, then verify:

- `GET /api/health` returns `200` and `database: reachable`;
- security headers are present over HTTPS;
- a company and partner can submit intake, receive verification email, set a
  password and reach only their own workspace;
- an invitation, verification case, capacity pulse and match offer complete end to end;
- expired capacity is excluded from routing;
- evidence upload uses KMS headers and download is an attachment-only short URL;
- webhook signatures fail when altered and duplicate events do not reprocess;
- audit entries exist for every material state change.
- a pending payment rail requires operator approval before it can receive pay-ins;
- two simultaneous order claims result in one assignment only, with matching locked exposure;
- pay-in, pay-out, dispute resolution and settlement batching complete end to end.

Do this first in staging with synthetic identities and files. Never use demo data as
public evidence of traction.

## 6. Schedule maintenance and monitoring

Call `/api/cron/watchdogs` on a schedule with:

```text
Authorization: Bearer <CRON_SECRET>
```

For tighter queue housekeeping, call `/api/cron/processing` every five minutes with the
same authorization header from a scheduler supported by your deployment plan. It is not
placed in `vercel.json`, so a Vercel Hobby deployment is not rejected for cron frequency;
the existing daily watchdog still performs the same expiry pass, and every claim checks
the exact expiry time server-side.

Monitor `/api/health`, application error rate, email delivery, database connections,
backup freshness and webhook failures. Alert an operator; never expose detailed
health diagnostics publicly.

## 7. Release gate for live counterparties

- Legal counsel has approved the operating model and public documents.
- The data-retention/deletion policy and incident contacts are documented.
- At least two genuinely reviewed partners cover the initial narrow corridor.
- Capacity expiry and response-time expectations are agreed with each partner.
- No marketing claim promises safety, licensing, liquidity, price or completion.
- A human operator owns verification decisions and incident escalation.
- Production access, provider keys and database permissions follow least privilege.
- Rollback and database restore procedures have been rehearsed.

## Rollback

Roll back application code by deploying the previous immutable commit. Do not reverse
a production migration automatically. Freeze affected writes, take a backup, inspect
the audit trail and apply a reviewed forward migration. Restore the database only when
forward repair is unsafe and the recovery point has been confirmed.
