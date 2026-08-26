# Gongyo Trainer

A static, installable Gongyo ritual checklist and paced reading trainer. The app is designed for GitHub Pages and works offline after its first successful load.

## Application

- `web/index.html` is the canonical single-page app with Ritual and Trainer views selected by `?view=ritual|trainer`.
- Ritual renders the nested checklist from `web/assets/ritual.txt`. Each recitation can expand its canonical chapter inline before Sound Bell.
- Trainer presents the same two movable chapter sections together, with seekable audio and local, portable audio-synchronized timing data.
- `web/ritual.html` and `web/syllables.html` are lightweight legacy redirects that preserve deep-link hashes.

## Local Development

Service workers require an HTTP origin. The Nix development shell provides
Python, ngrok, and ntfy without adding runtime dependencies to the PWA.

```bash
./tools.sh serve
```

Open `http://127.0.0.1:8000/`.

The development server disables conditional/browser caching and supports byte
ranges so updated service workers load immediately and audio remains seekable.
`internal/server.py` is the local-only implementation behind `tools.sh`; it is
not a user-facing entry point or part of the deployed application.

To expose the server through an ngrok-assigned URL, run this in another
terminal:

```bash
./tools.sh tunnel
```

Send a development notification with:

```bash
./tools.sh notify "message"
```

Copy `.env.example` to `.env` to override the HTTP port, ngrok URL, ntfy server,
or ntfy topic. The ntfy server and topic are separate settings so a future local
ntfy server does not require changing the notification command.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys only `web/` as a static Pages artifact whenever `main` is pushed.

After creating the GitHub repository:

1. Push `main` to GitHub.
2. Open repository Settings, then Pages.
3. Select **GitHub Actions** as the source if it is not selected automatically.
4. Wait for the `Deploy GitHub Pages` workflow to complete.

The expected project URL is `https://<owner>.github.io/gongyo-trainer/`.

### Feature Branch Preview

The Pages workflow supports manual dispatch from a pushed feature branch. This
deploys that branch's `web/` directory to the normal Pages URL; it is not an
isolated preview URL and temporarily replaces the currently published site.

```bash
branch="$(git branch --show-current)"
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
git push -u origin "$branch"
gh api --method POST \
  "repos/$repo/environments/github-pages/deployment-branch-policies" \
  -f name="$branch" -f type=branch
gh workflow run pages.yml --ref "$branch"
gh run watch
```

Push `main` or manually dispatch `pages.yml` from `main` to restore the default
branch deployment. After restoring it, remove the temporary environment rule:

```bash
policy_id="$(BRANCH="$branch" gh api \
  "repos/$repo/environments/github-pages/deployment-branch-policies" \
  --jq '.branch_policies[] | select(.name == env.BRANCH) | .id')"
gh api --method DELETE \
  "repos/$repo/environments/github-pages/deployment-branch-policies/$policy_id"
```

## Content Editing

The ritual and chapter content are plain text files. JavaScript parses them at runtime; do not duplicate their content in HTML.

- Ritual syntax and behavior: see `PLAN.md`.
- Chapter syntax and pacing behavior: see `PLAN.md`.
- Confirmed spoken-syllable classification: `docs/two-syllable-classification.md`.

## Versioning

Every deployed app change must update the visible `vN` label in `web/index.html` and `CACHE_NAME` in `web/sw.js` to the same next integer. This forces installed/offline clients to receive the new app shell.

## Scope

The application may include approved M4A runtime assets only under `web/assets/`.
The repository otherwise excludes video and media editing, timing or splice
review, beat collection, generated media artifacts, and deployed backends or
APIs. Local development server implementation is confined to `internal/` and
invoked through `tools.sh`.

All web-hosted files live under `web/`. Repository documentation, local tooling,
agent instructions, and deployment automation remain outside the published
artifact. `.github/workflows/pages.yml` deploys strictly `web/`.
