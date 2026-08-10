# INRP2P

INRP2P is a private operating system for reviewed INR liquidity relationships.
It lets a company maintain an approved partner network, collect current capacity,
route a requirement deterministically, exchange offers, manage evidence and keep
an auditable incident and verification record.

The product is a coordination and introduction layer. It does not hold or
execute the underlying counterparty transaction, run an order book, guarantee
liquidity or replace a party's licensing, KYC/AML, tax or legal obligations.
Separately agreed partner operating-reserve deposits are sent to the configured
company USDT-TRC20 address and recorded in an audited, human-confirmed ledger.
The application stores the public address and transaction references, never a
wallet seed phrase or private key.

## What is implemented

- Three role-separated workspaces: operator, company and liquidity partner.
- Email ownership verification, single-use password recovery and session revocation.
- Database-backed abuse limiting plus Cloudflare Turnstile on public intake.
- Private company-to-partner invitations with explicit acceptance and pause states.
- Partner verification cases, normalized provider checks and accountable manual review.
- Evidence uploads to a private S3-compatible vault using short-lived signed URLs,
  mandatory KMS encryption headers and forced-attachment downloads.
- Time-bounded capacity declarations by direction and deterministic eligibility/ranking.
- Match offers with accept/decline/expiry flow; no automated financial decision.
- Incident tracking and audit events across material network operations.
- Signed, replay-resistant inbound webhook handling for notification integrations.
- Reserve-controlled merchant processing desk with separate pay-in and pay-out state
  machines, reviewed payment rails, atomic order assignment, UTR/reference capture,
  disputes, exposure locking and settlement reconciliation.
- Health endpoint, scheduled maintenance hook, security headers and CI quality gate.
- Public landing page focused on the operating problem, controls and private-beta CTA.

## Stack

Next.js 16 App Router, React 19, TypeScript, Prisma 6, PostgreSQL, Tailwind CSS,
Zod and database-backed opaque sessions.

Use Node.js 20 or newer.

## Local setup

```bash
npm ci
cp .env.example .env
# Set both database URLs and strong seed credentials.
npm run db:deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. New company and partner accounts must verify email
and set their own password before accessing private workspace data.

Do not run the demo seed against production. For an isolated staging database:

```bash
DEMO_PASSWORD='a-unique-staging-password' npm run db:seed:demo
```

## Training Mode for walkthroughs

Training Mode provides one deterministic trader journey for onboarding, sales
walkthroughs and screen recording. It is not public traction and does not represent
historical customer activity. The scenario engine uses reserved `@inrp2p.demo`
identities and rebuilds the same known state every time.

Create a separate Vercel project with a separate staging PostgreSQL database. Never
enable Training Mode on the production deployment or point it at the production
database. Configure a non-production `PROCESSING_DATA_KEY`, then set:

```bash
TRAINING_MODE_ENABLED=true
TRAINING_PARTNER_EMAIL=video-trader@inrp2p.demo
TRAINING_PARTNER_PASSWORD='a-unique-14-character-password'
TRAINING_SCENARIO=HISTORY
```

Deploy the database migrations and prepare the account:

```bash
npm run db:deploy
npm run db:seed:training
```

An operator can then open `/admin/training` and reset the account to one of five
recording states: new trader, verification in progress, ready to activate, live desk
ready or established desk. The partner signs in with `TRAINING_PARTNER_EMAIL` and the
configured password. The company-side simulator uses `video-merchant@inrp2p.demo`
with the same password when a merchant perspective is needed.

Training safeguards are enforced in application code:

- a persistent Training Mode banner is shown in partner and company workspaces;
- no destination wallet is issued and no blockchain transfer can be submitted;
- real payment-rail entry is blocked for the training trader;
- Telegram, WhatsApp, password-reset email and live dispute alerts are suppressed;
- simulated reserve entries are excluded from the production deposit dashboard;
- scenarios, orders, events and commissions are deterministic and resettable.

Keep the banner visible in published material. Describe displayed income as
“simulated commission in Training Mode”, never as real trader earnings. Use only
synthetic names, UTRs, bank details and documents, and reset the scenario before each
recording session.

## Quality gate

```bash
DATABASE_URL='postgresql://user:pass@localhost:5432/inrp2p' \
DATABASE_URL_UNPOOLED='postgresql://user:pass@localhost:5432/inrp2p' \
npm run check
```

The same validation runs in `.github/workflows/quality.yml`: schema validation,
lint, static types, deterministic unit tests and a production Next.js build.

## Database migrations

Fresh databases can run `npm run db:deploy` directly. The repository contains a
complete baseline followed by private-network, verification, reserve and live-processing migrations.

For a database created by an older version of this application, first take a
verified backup and compare its schema with the baseline. Mark the baseline as
applied only if the database already contains that exact baseline:

```bash
npx prisma migrate resolve --applied 20260715000100_baseline
npm run db:deploy
```

Never use `prisma db push` for a production upgrade. Review the generated SQL and
perform the first upgrade in staging before the live database.

## Production requirements

The application deliberately fails closed in production when Turnstile is not
configured. Email must also be configured before onboarding users, because account
ownership and password setup use single-use email links. Evidence uploads stay
disabled until the encrypted object vault is configured.

The minimum launch configuration is:

- PostgreSQL with automated backups and point-in-time recovery.
- `NEXT_PUBLIC_SITE_URL`, contact details and a release version.
- Resend credentials and a verified sending domain.
- Cloudflare Turnstile public and secret keys.
- A high-entropy `CRON_SECRET` if the scheduled maintenance route is enabled.
- Private S3 + KMS credentials before collecting verification evidence.
- A checksum-valid public `USDT_TRC20_DEPOSIT_ADDRESS` before enabling partner reserves.
- A stable base64 32-byte `PROCESSING_DATA_KEY` before storing live payment-rail or
  beneficiary data. Back up this key in the production secret manager; never rotate it
  without a planned data re-encryption migration.
- Real operator credentials stored in a password manager, not in source control.
- `TRAINING_MODE_ENABLED=false` with no `@inrp2p.demo` identities in the production database.

See `.env.example` for every supported integration and [DEPLOYMENT.md](DEPLOYMENT.md)
for the release runbook.

## Core operating flow

1. A company verifies its email and submits a structured requirement.
2. The operator completes the company's verification review.
3. Partners accept private network invitations and complete their own review.
4. Partners publish direction-specific capacity with an expiry time.
5. Routing includes only connected, approved, active and currently capable partners.
6. The operator sends a time-bounded offer to selected partners.
7. The partner accepts or declines; the operator controls any real-world introduction.
8. Incidents, evidence decisions and state changes remain in the audit history.

## Live merchant processing flow

1. A partner adds UPI or bank rails. Full destinations are encrypted and stay pending
   until an operator records a review decision.
2. After reserve confirmation, the operator enables the partner and sets the hard INR
   concurrent-exposure limit plus pay-in/pay-out fee schedule.
3. A company releases a real pay-in or pay-out order with its own merchant reference.
4. An eligible partner takes the order. Assignment and exposure locking happen in one
   serializable database transaction, so two traders cannot take the same order.
5. Pay-in closes only after the company records the payer reference and the partner
   confirms the exact INR receipt. Pay-out closes only after the partner records a UTR
   or payment reference and the company confirms delivery.
6. A dispute keeps exposure locked until an operator records the resolution.
7. Completed orders are grouped by company and partner into a settlement batch. Gross
   pay-in, gross pay-out, partner fee and net INR position remain separately visible.

INRP2P records and controls this operating workflow. Transfers still occur through the
parties' approved external bank, UPI or settlement rails; the application does not hold
bank credentials or private wallet keys.

## Security boundary

- Passwords are bcrypt hashes; opaque session and recovery tokens are stored as hashes.
- All private reads and writes are re-authorized on the server.
- State transitions are allow-listed; approval cannot be skipped by changing form data.
- Public automation is deterministic and eligibility-based. AI is optional operator
  assistance and never approves a party, routes money or makes a financial decision.
- Object evidence is never proxied through a public route or rendered inline.
- Integration secrets, production evidence and identity documents must never be added
  to this repository.

## Legal and commercial readiness

The included terms, privacy and disclaimer pages are product templates, not legal
advice. Before accepting live Indian counterparties or charging transaction-linked
fees, obtain jurisdiction-specific advice on the exact operating model, virtual-asset
exposure, AML/KYB obligations, data retention, privacy and marketing claims.

Code readiness does not create liquidity. Launch as a controlled private beta with a
small number of reviewed partners, published response-time standards and no claims of
guaranteed volume, guaranteed safety or guaranteed completion.
