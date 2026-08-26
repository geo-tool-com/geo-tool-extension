## What does this change?

<!-- One or two sentences. Link the issue if one exists. -->

## Checklist

- [ ] `npm run build` succeeds and the network-path guard still passes
- [ ] No scoring change — `src/core/` is vendored from the monorepo and only
      changes via an upstream sync
- [ ] Still exactly two permissions (`activeTab`, `scripting`), no host
      permissions, no background requests, no telemetry
- [ ] `manifest.json`, `_locales/`, and icons unchanged unless the PR is a
      release
- [ ] Docs updated where behavior or usage changed
