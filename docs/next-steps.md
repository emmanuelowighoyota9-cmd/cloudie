# Cloudie — ordered next steps and evidence handoff

This is the single ordered checklist for the remaining human-run acceptance work. Do not treat a step as complete without its evidence. Convex remains the live backend; Neon is not authoritative. Do not run migrations on production branch `br-winter-snow-b5spd77h`, do not use a pooled Neon connection, and do not connect Convex and Neon to the same running app simultaneously.

## Step 1 — Diagnose migrations on a disposable Neon branch

**Command**

Run from the repository root on a machine with `git`, `neonctl`, `psql`, and the Neon CLI authenticated:

```bash
git checkout main
git pull --ff-only origin main

neonctl branches create \
  --name test-migrations \
  --parent br-winter-snow-b5spd77h \
  --project-id lively-sky-99526507

# Set this to the direct (non-pooler) connection string for test-migrations.
export TEST_DATABASE_URL='postgresql://<user>:<password>@<direct-host>/neondb?sslmode=require'
export NEON_TEST_BRANCH_NAME='test-migrations'
export NEON_TEST_BRANCH_ID='<branch-id-returned-by-neonctl>'

# Check locally that the URL is direct and that the branch ID/name match Neon Console.
case "$TEST_DATABASE_URL" in *-pooler.*|*pgbouncer=true*|*pool_mode=*) echo "ERROR: pooled URL; stop"; exit 2;; esac
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()'
# Only continue if the result is neondb and the endpoint/branch are confirmed in Neon Console.
bash scripts/neon-diagnose.sh
```

**Expected output**

The script confirms the database is `neondb`, names the declared test branch, successfully runs all seven numbered migration files in order twice, inspects `schema_migrations` and public base tables, and ends with `DIAGNOSTIC COMPLETE`. Any failure must stop the sequence and report the exact failed file, PostgreSQL error, line/context, and exit code.

**What to paste back**

- The `neonctl branches create` output including branch ID (redact credentials).
- Confirmation from Neon Console that the URL endpoint is the direct endpoint for that exact disposable branch.
- Full diagnostic output and exit code, including the exact failing migration/error if it fails.
- Do not paste the connection URL, password, tokens, or other secrets.

**What blocks the next step**

Any failed migration, pooled endpoint, uncertain branch identity, or safety guard failure. Do not edit a migration until a diagnostic identifies the exact failing file and line.

## Step 2 — Reconcile `migrations/STATUS.md` against evidence

**Command**

After Step 1, inspect the actual database and runner state:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
  "SELECT * FROM public.schema_migrations ORDER BY version"
npm --prefix api run migrate
git diff -- migrations/STATUS.md
```

If `schema_migrations` does not exist, capture that result instead of running the second query; the diagnostic output reports whether it exists. Confirm `npm --prefix api run migrate` is configured for the same disposable branch before running it. Do not point it at the production branch.

**Expected output**

A reconciled status document distinguishes what was proven on the disposable branch from any unknown production/live-branch state. The checksum-aware runner's output agrees with the actual rows/schema, or its discrepancy is documented. A successful file-by-file diagnostic alone does not prove the checksum-aware runner or API E2E passes.

**What to paste back**

Table inventory, `schema_migrations` output (or explicit absence), redacted migrate command output and exit code, and the resulting `migrations/STATUS.md` diff.

**What blocks the next step**

Unexplained table/checksum discrepancies or a status document that still states unverified application as fact. Do not claim production migration state from a disposable branch.

## Step 3 — Run the CI lockfile regeneration, then verification workflow

**Command**

From the repository root, with GitHub CLI authenticated and repository access configured:

```bash
git checkout main
git pull --ff-only origin main

gh workflow run regen-lock.yml --ref main
gh run list --workflow=regen-lock.yml --branch main --limit 5
# Copy the numeric run ID from the list, then:
gh run view <REGEN_RUN_ID> --log
gh run view <REGEN_RUN_ID>

git fetch origin main
git log -5 --oneline origin/main

gh workflow run verify.yml --ref main
gh run list --workflow=verify.yml --branch main --limit 10
# Copy the numeric run ID from the list, then:
gh run view <VERIFY_RUN_ID>
gh run view <VERIFY_RUN_ID> --log
```

**Expected output**

The regeneration workflow completes and either commits a regenerated lockfile or clearly reports why it did not. Then inspect the verify run's **root** and **api** jobs individually; both must complete successfully on the commit that includes the intended lockfile. A workflow dispatch request by itself is not a pass.

**What to paste back**

Both run URLs/IDs, terminal conclusions, `gh run view <ID>` output, and the root and API job logs. Include the commit SHA tested and any lockfile changes. Redact secrets.

**What blocks the next step**

Missing run, failed/cancelled job, absent root/API logs, lockfile drift, or verify run testing a commit that does not include the final lockfile. Never report CI green without the run URL and both job logs.

## Step 4 — Run the live Convex verification script

**Command**

Use a non-production Convex deployment, a dedicated buyer account with a wallet, a separate approved vendor account, and an active package visible to the buyer. Set all four variables in the same shell:

```bash
export CONVEX_URL='https://<non-production-deployment>.convex.cloud'
export BUYER_AUTH_TOKEN='<buyer-token>'
export VENDOR_AUTH_TOKEN='<approved-vendor-token>'
export TEST_PACKAGE_ID='<active-pointPackages-id>'

bunx tsc -p tsconfig.scripts.json
bun run verify:convex
```

The script creates an escrow order as buyer, fulfills it as vendor, checks the credited status as buyer, then pauses for the operator to lower the **test buyer's NGN wallet** below the package price before it tests insufficient funds.

**Expected output**

TypeScript compilation exits 0. Runtime output confirms buyer authentication, `escrow`, vendor fulfillment, `credited`, and the exact message assertion containing `Insufficient NGN wallet balance`; final line: `All manual Convex verification assertions passed.` This has not yet been run by this environment.

**What to paste back**

Compiler output and exit code; full redacted script output and exit code; confirmation that buyer/vendor tokens belong to separate test accounts; deployment environment (not the secret URL/token); and the exact insufficient-funds assertion output.

**What blocks the next step**

Missing variables, same buyer/vendor identity, production deployment, package not visible/active, compile failure, any failed assertion, or absent pasted output. Never paste auth tokens.

## Step 5 — Run the marketplace browser acceptance protocol

**Command**

Open and follow [`docs/marketplace-e2e.md`](marketplace-e2e.md) against the live non-production deployment. Run the complete procedure at both 375×667 and 1440×900 using separate buyer and vendor sessions.

**Expected output**

All checks pass at both viewport sizes. The three acceptance groups are:

1. **Currency-safe review and failure behavior:** correct NGN price, signed green points reward, wallet-after calculation, no line combining the NGN currency symbol with the reward-unit label, and insufficient-funds failure states “You were not charged.” with both balances unchanged.
2. **Order lifecycle and reactive UI:** reference matches `createOrder`; vendor fulfillment changes the buyer dialog from pending to success without a reload; receipt fields and reloaded balances reconcile.
3. **Responsive usability:** review/pending/success/failed states remain readable and operable at both viewports, with no mobile viewport overflow.

**What to paste back**

Completed checklist with PASS/FAIL/BLOCKED for every row, deployment URL, timestamps, screenshots/video at both sizes, redacted order references, initial/final NGN and points balances, browser console/network errors, and exact failure output if any.

**What blocks the next step**

Any failure or blocked acceptance criterion, missing evidence, a success state only after reload/manual refresh, balance mismatch, or mobile overflow. File/fix the demonstrated issue before calling the marketplace accepted.

## Step 6 — Owner records the cutover decision

**Command**

Read [`docs/cutover-decision.md`](cutover-decision.md) and fill in its **Decision record — owner to complete** block only after reviewing the evidence above and the cutover gates. Copy and complete this exact block in the document:

```text
- Selected option (A, B, or C): ____________________
- Why this option fits current production constraints: ____________________
- Domains in the first cutover scope: ____________________
- Authoritative writer for User and PointLedger: ____________________
- Downtime/replication/feature-flag operating constraints: ____________________
- Acceptance evidence required before rollout: ____________________
- Rollback trigger and responsible owner: ____________________
- Decision owner and date: ____________________
```

**Expected output**

The owner selects A (full cutover), B (shadow reads/write-through replication), or C (feature-flagged domain-by-domain cutover), explains constraints, names authoritative ownership for shared `User` and `PointLedger`, and records acceptance/rollback evidence. No option is preselected here.

**What to paste back**

The completed decision block, owner/date, and rationale. Include the commit URL if the block is committed.

**What blocks the next step**

No owner decision, unclear authoritative writer for shared state, missing financial reconciliation, unproven rollback, or unsatisfied option-specific gates. Do not implement cutover routing until the decision is explicit.

## Overall completion rule

Paste evidence for each step in order. A command request, a committed protocol, a static inspection, or a workflow dispatch is not equivalent to a passing live test. Keep Convex authoritative until a separately approved cutover plan has met its gates.
