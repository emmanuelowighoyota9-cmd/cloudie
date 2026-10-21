#!/usr/bin/env bash
# Safe, file-by-file Neon migration diagnostic. This is NOT the checksum-aware runner.
# Run only against a disposable Neon branch. No credentials are printed.
set -Eeuo pipefail

readonly PRODUCTION_BRANCH_ID="br-winter-snow-b5spd77h"
readonly EXPECTED_BRANCH_NAME="test-migrations"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

[[ -n "${TEST_DATABASE_URL:-}" ]] || fail "Set TEST_DATABASE_URL to the direct connection string for the disposable Neon test branch."
[[ -z "${DATABASE_URL:-}" || "$DATABASE_URL" != "$TEST_DATABASE_URL" ]] || fail "TEST_DATABASE_URL equals DATABASE_URL; refusing a possibly production-targeted connection."
[[ "${NEON_TEST_BRANCH_NAME:-}" == "$EXPECTED_BRANCH_NAME" ]] || fail "Set NEON_TEST_BRANCH_NAME=$EXPECTED_BRANCH_NAME only after confirming the connection belongs to that disposable branch."
[[ -n "${NEON_TEST_BRANCH_ID:-}" ]] || fail "Set NEON_TEST_BRANCH_ID to the branch ID returned by Neon for the disposable branch."
[[ "$NEON_TEST_BRANCH_ID" != "$PRODUCTION_BRANCH_ID" ]] || fail "Refusing known production branch ID $PRODUCTION_BRANCH_ID."
command -v psql >/dev/null 2>&1 || fail "psql is required but was not found."
[[ -d migrations ]] || fail "Run this script from the repository root (migrations/ not found)."

# Reject common Neon pooler forms. Do not print the URL (it contains credentials).
if [[ "$TEST_DATABASE_URL" == *"-pooler."* ]] || [[ "$TEST_DATABASE_URL" == *"pgbouncer=true"* ]] || [[ "$TEST_DATABASE_URL" == *"pool_mode="* ]]; then
  fail "Pooled connection strings are not allowed. Use the direct Neon endpoint."
fi
if [[ "$TEST_DATABASE_URL" != postgresql://* && "$TEST_DATABASE_URL" != postgres://* ]]; then
  fail "TEST_DATABASE_URL must be a PostgreSQL URL."
fi

# Confirm the target is the expected database and show non-secret connection identity.
db_name="$(psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')"
[[ "$db_name" == "neondb" ]] || fail "Connected database is '$db_name', expected 'neondb'. No migrations were run."
printf 'Connected database: %s\n' "$db_name"
printf 'Declared Neon test branch: %s (%s)\n' "$NEON_TEST_BRANCH_NAME" "$NEON_TEST_BRANCH_ID"
printf 'Safety note: branch name/ID are operator-supplied; verify them against Neon Console before running. The script rejects the known production ID but cannot cryptographically bind a URL to a branch ID.\n'

mapfile -t migrations < <(find migrations -maxdepth 1 -type f -regextype posix-extended -regex 'migrations/[0-9]{3}_.+\.sql' -print | sort)
(("${#migrations[@]}" == 7)) || fail "Expected exactly seven numbered migration files, found ${#migrations[@]}."

printf '\n== Pass 1: execute every migration in lexical/numeric order ==\n'
for file in "${migrations[@]}"; do
  printf '\n--- %s ---\n' "$file"
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$file" || {
    status=$?
    printf 'FAILED: %s (psql exit %s). Stop here; capture the exact server error and line above.\n' "$file" "$status" >&2
    exit "$status"
  }
done

printf '\n== Pass 2: rerun the full set to test idempotency ==\n'
for file in "${migrations[@]}"; do
  printf '\n--- %s ---\n' "$file"
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$file" || {
    status=$?
    printf 'IDEMPOTENCY FAILURE: %s (psql exit %s).\n' "$file" "$status" >&2
    exit "$status"
  }
done

printf '\n== Bookkeeping inspection ==\n'
has_migrations="$(psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT to_regclass('public.schema_migrations') IS NOT NULL")"
if [[ "$has_migrations" == "t" ]]; then
  printf 'schema_migrations exists; columns:\n'
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations' ORDER BY ordinal_position"
  printf '\nschema_migrations rows (if any):\n'
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'SELECT * FROM public.schema_migrations ORDER BY version'
else
  printf 'schema_migrations does not exist.\n'
fi

printf '\n== Resulting public base tables ==\n'
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"

printf '\nDIAGNOSTIC COMPLETE: both direct psql passes succeeded. This does not prove the checksum-aware runner or API E2E tests pass.\n'
