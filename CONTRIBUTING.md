# Contributing

## Changing dependencies

Any change to `package.json` (dependencies or scripts) requires regenerating `bun.lock`. Batch all planned manifest changes before regenerating:

1. Push the complete `package.json` change to `main`.
2. Run `gh workflow run regen-lock.yml --ref main`.
3. Wait for the workflow to finish and its lockfile commit to land on `main`.
4. Confirm that no newer `package.json` change landed after that lockfile commit. If one did, run regeneration again.
5. Run `gh workflow run verify.yml --ref main`.

`verify.yml` intentionally uses `bun install --frozen-lockfile` to detect drift. Do not hand-edit `bun.lock` or disable frozen installs.

## Live Convex verification

`bun run verify:convex` is manual-only and is not run in CI. It requires a live Convex dev deployment, separate buyer and approved-vendor test tokens, a test package, and a wallet adjustment before the insufficient-funds check.
