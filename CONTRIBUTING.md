# Contributing

## Changing dependencies

Any change to `package.json` (dependencies or scripts) requires regenerating `bun.lock`:

1. Push your change.
2. Run `gh workflow run regen-lock.yml --ref main`.
3. Wait for the regen commit on `main`.
4. Run `gh workflow run verify.yml --ref main`.

`verify.yml` intentionally uses `bun install --frozen-lockfile` to detect drift. A verification run may fail fast if a push changes `package.json` before the lockfile regeneration commit lands; regenerate the lockfile and rerun verification rather than disabling the frozen install.
