# Agent Instructions

Read `PLAN.md` before changing behavior. Treat it as the product and architecture source of truth.

## Rules

- Keep the application static and compatible with GitHub Pages project paths.
- Use relative URLs; never assume deployment at `/`.
- Treat `web/` as the complete GitHub Pages artifact. Do not place hosted files at repository root.
- Keep ritual and chapter content in `web/assets/*.txt`, not duplicated in HTML or JavaScript.
- Approved M4A runtime assets may be added only under `web/assets/`; do not add other media or any video/media editing, timing-review, splice-review, beat-collection, or generated-media artifacts.
- Local-only server implementation may be added only under `internal/`; do not add a deployed backend or API.
- Preserve mobile usability and offline installation.
- On every deployable change, increment the visible version in both HTML pages and `CACHE_NAME` in `web/sw.js` to the same integer.
- Add every install-critical runtime file to `APP_SHELL` in `web/sw.js`. Large seekable M4A files may intentionally be excluded so they do not block service-worker activation.
- Validate JavaScript syntax and verify every `APP_SHELL` path exists before considering work complete.

## Minimal Validation

```bash
node --check web/src/ritual.js
node --check web/src/syllables.js
node --check web/sw.js
python3 -m json.tool web/manifest.webmanifest >/dev/null
```

Serve `web/` locally over HTTP and test both pages at mobile width. Test with the browser offline after one online load when changing service-worker behavior.
