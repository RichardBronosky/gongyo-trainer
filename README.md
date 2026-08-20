# Gongyo Trainer

A static, installable Gongyo ritual checklist and paced reading trainer. The app is designed for GitHub Pages and works offline after its first successful load.

## Pages

- `web/ritual.html` renders the nested ritual checklist from `web/assets/ritual.txt`.
- `web/syllables.html` renders Chapters 2 and 16 from `web/assets/syllables.5-wide.txt`.
- `web/index.html` redirects to the ritual page.

## Local Development

Service workers require an HTTP origin. From the repository root:

```bash
python3 -m http.server 8000 --directory web
```

Open `http://127.0.0.1:8000/`.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys only `web/` as a static Pages artifact whenever `main` is pushed.

After creating the GitHub repository:

1. Push `main` to GitHub.
2. Open repository Settings, then Pages.
3. Select **GitHub Actions** as the source if it is not selected automatically.
4. Wait for the `Deploy GitHub Pages` workflow to complete.

The expected project URL is `https://<owner>.github.io/gongyo-trainer/`.

## Content Editing

The ritual and chapter content are plain text files. JavaScript parses them at runtime; do not duplicate their content in HTML.

- Ritual syntax and behavior: see `PLAN.md`.
- Chapter syntax and pacing behavior: see `PLAN.md`.
- Confirmed spoken-syllable classification: `docs/two-syllable-classification.md`.

## Versioning

Every deployed app change must update all visible `vN` labels and `CACHE_NAME` in `web/sw.js` to the same next integer. This forces installed/offline clients to receive the new app shell.

## Scope

This repository intentionally excludes media editing, timing review, beat collection, generated videos, and local Python server tooling. It contains only the deployable Ritual/Trainer PWA.

All web-hosted files live under `web/`. Repository documentation, agent instructions, and deployment automation remain outside the published artifact.
