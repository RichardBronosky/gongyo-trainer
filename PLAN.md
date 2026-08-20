# Gongyo Trainer Project Plan

## 1. Mission

Build a mobile-first, static web application that guides a user through the Gongyo ritual and provides paced, self-scrolling reading views for Chapters 2 and 16.

The application must:

- Deploy directly to GitHub Pages with no build step or backend.
- Install as a Progressive Web App.
- Work offline after one successful online load.
- Keep editable religious/reading content in plain text assets.
- Support one-handed phone use during the ritual.
- Preserve precise pacing and repetition behavior in the trainer.

## 2. Non-Goals

Do not add the following to this repository:

- Video files or audio files other than approved M4A runtime assets under `web/assets/`.
- Timing-review or splice-review interfaces.
- Beat collection data or reconciliation tools.
- Deployed servers, backends, or APIs. The local-only server under `internal/` is development tooling.
- Generated media artifacts.
- Frameworks, package managers, bundlers, or runtime dependencies unless a future requirement cannot reasonably be met with browser APIs.

External Google Drive chapter links are intentional references and are not application runtime assets.

## 3. Current Product

### Ritual View

`web/ritual.html` loads and parses `web/assets/ritual.txt`.

Behavior:

- Indentation creates nested list structure.
- Lines beginning with `*` are completable top-level ritual actions.
- Lines beginning with `-` are nested explanatory/action items without checkboxes.
- Parent items have explicit expand/collapse controls.
- Completing a parent collapses its descendants.
- Recitation actions link to the corresponding trainer chapter.
- Non-list lines render as notes below the checklist.
- Kanji runs render at three times the surrounding text size.
- A second Trainer link appears after the checklist.

The Daimoku line contains a timer placeholder:

```text
* Daimoku |__| minutes
```

The renderer replaces the placeholder with:

- A persisted numeric minute selector.
- An hourglass start/completion control.
- A full-screen countdown with add/subtract minute controls.
- A flashing black/white completion state that requires acknowledgement.
- Automatic completion and child collapse after acknowledgement.

The selected minute value is stored under `localStorage` key `gongyo.daimokuMinutes`.

### Trainer View

`web/syllables.html` loads and parses `web/assets/syllables.5-wide.txt`.

Behavior:

- The file is split into chapters by a line containing `----`.
- Tab-separated cells render as reading cells.
- Chapter title lines render separately in five-column rows.
- Chapter 2 begins in five-column mode.
- The checkbox marker row remains five columns.
- Rows after the marker use seven-column layout.
- Chapter 16 starts over in five-column mode.
- Empty padded cells are visual layout only and never receive FSD beats.
- Checkbox marker cells are controls only and never receive FSD beats.
- Confirmed two-spoken-syllable cells receive a dark red underline.

Chapter labels link to the externally hosted reference files. Each chapter ends with a link back to its exact Ritual checklist item.

Each chapter also has native audio controls backed by its approved relative M4A asset. Playback supports pause, resume, and timeline seeking; only one chapter plays at a time. Pausing removes the active FSD highlight without resetting the audio playhead, and resumed or seeked playback follows `audio.currentTime` using saved timing.

## 4. Self-Driving Mode

The trainer's Full Self-Driving mode, abbreviated FSD, estimates reading speed and highlights one spoken cell at a time.

### Initial Calibration

- The user taps five consecutive chant rows.
- The last three taps produce two row time spans.
- Each row span is normalized by its actual nonempty chant-cell count.
- The two normalized per-cell durations are averaged.
- FSD starts on the fifth row.

### Speed Correction

- FSD records the scheduled time of each row and cell.
- Tapping the current or next row compares the tap with its scheduled transition, not with the last manual tap.
- Row-boundary correction uses only the early/late phase difference.
- Tapping a cell in the active row jumps to that cell and applies a split-the-difference correction.
- Per-tap rate changes are limited to 10 percent.
- Absolute rate is constrained to 20–240 BPM.
- The translucent BPM bubble disengages FSD when tapped.

### Repeated Section

The three marker cells before `Sho i sho ho` represent three passes through the final Chapter 2 section.

- The chant flows directly from `jis so` to `Sho i sho ho` with no empty beats.
- The section from `Sho i sho ho` through `mak ku kyo to` plays three times.
- At pass start, its marker changes from `[_]` to `[-]`.
- When `mak` is highlighted, that marker changes to `[X]`.
- FSD tries to keep the marker row visible when the marker and active row fit in one viewport.
- FSD stops at the end of the current chapter and never crosses into another chapter.

The implementation should remain data-oriented enough to support additional repeated sections later.

### Audio Timing

- Tapping five consecutive rows while chapter audio plays calibrates FSD against the audio playhead and persists the resulting full-chapter timeline.
- Chapter 2 timing is stored under `gongyo.fsd.chapter2`; Chapter 16 timing is stored under `gongyo.fsd.chapter16`.
- Saved timing drives highlighting during later playback, including forward and backward seeking.
- Each chapter reports timing status and provides a JSON copy action with a legacy clipboard fallback.

## 5. Content Formats

### `web/assets/ritual.txt`

- UTF-8 text.
- Two spaces per nesting level.
- `* ` denotes a completable ritual item.
- `- ` denotes a non-checkbox nested item.
- Non-list text becomes notes.
- `|__| minutes` invokes the timer UI.
- `Recite Chapter 2` and `Recite Chapter 16` invoke trainer links.

### `web/assets/syllables.5-wide.txt`

- UTF-8 text.
- Tabs separate cells; spaces are content and must not replace tabs.
- `----` separates chapters.
- `[_]` cells define the repeat marker row.
- Blank cells preserve layout but are not spoken beats.
- The Vim modeline is ignored by the parser.

## 6. Architecture

The application intentionally uses browser-native HTML, CSS, and JavaScript.

- `web/`: Complete GitHub Pages artifact; no documentation or tooling belongs here.
- `web/index.html`: GitHub Pages landing redirect.
- `web/ritual.html`: Ritual page shell.
- `web/syllables.html`: Trainer page shell.
- `web/src/ritual.js`: Ritual parser, renderer, timer, checklist behavior.
- `web/src/ritual.css`: Ritual layout and timer presentation.
- `web/src/syllables.js`: Chapter parser, renderer, FSD timing engine.
- `web/src/syllables.css`: Trainer grid, highlights, responsive presentation.
- `web/manifest.webmanifest`: Install metadata.
- `web/sw.js`: Offline app-shell cache.
- `web/assets/`: Runtime content, icons, and approved M4A audio only.
- `docs/`: Human/AI reference material that is not fetched at runtime.
- `internal/server.py`: Local-only no-cache, byte-range development server behind `tools.sh`.
- `tools.sh`: Sole user-facing entry point for local development tools.

All runtime URLs must remain relative so the app works below the GitHub Pages project path `/gongyo-trainer/`.
The deployed application remains entirely static: `.github/workflows/pages.yml` publishes only `web/`, never `internal/` or other repository tooling.

## 7. Offline and Versioning Contract

The service worker installs the versioned critical app shell atomically. Approved M4A files are runtime assets rather than install-blocking app-shell entries. Same-origin byte-range requests bypass the Cache API so audio seeking can receive partial responses; navigations are network-first with exact-page and Ritual offline fallbacks, while other same-origin resources use the current cache with exact-key cache-first runtime filling.

For every deployable change:

1. Increment `CACHE_NAME` in `web/sw.js`.
2. Update the visible `vN` in `web/ritual.html`.
3. Update the visible `vN` in `web/syllables.html`.
4. Add any new install-critical runtime file to `APP_SHELL`. Large seekable M4A files may be intentionally excluded so service-worker activation is not blocked by audio downloads.
5. Confirm every `APP_SHELL` path exists.
6. Load once online, then verify both pages and their install-critical content while offline. M4A files excluded from `APP_SHELL` are not part of this activation-time offline guarantee.

Do not add random cache-busting query strings. Stable URLs are required for deterministic offline matching.

## 8. GitHub Pages Deployment

`.github/workflows/pages.yml` publishes only `web/`. Root documentation and repository metadata are never included in the Pages artifact.

Required repository configuration:

- Default branch: `main`.
- Pages source: GitHub Actions.
- Workflow permissions: Pages write and OIDC token write.
- No custom domain is required initially.

Deployment acceptance:

- Root project URL redirects to Ritual.
- Ritual and Trainer navigation works under `/gongyo-trainer/`.
- Manifest and icons load without 404s.
- Service worker scope is the project directory.
- Installed app opens Ritual.

## 9. Validation Checklist

### Static

- JavaScript passes `node --check`.
- Manifest parses as JSON.
- Every install-critical service-worker app-shell file exists; any intentionally excluded M4A remains under `web/assets/`.
- No absolute root-relative URLs such as `/assets/...` appear.
- Repository contains no video, unapproved audio, timing-review, splice-review, beat-collection, generated-media, or deployed server/backend/API files.

### Ritual

- Every `*` item has a completion control.
- Nested children expand and collapse.
- Completing a parent collapses children.
- Chapter links navigate to the correct trainer anchor.
- Timer minutes survive refresh and cache upgrades.
- Minus-to-zero enters flashing completion mode.
- Acknowledgement completes and collapses Daimoku.

### Trainer

- Both chapters render from the text asset.
- Five/seven-column transition occurs after the marker row.
- Empty and marker cells receive no FSD beat.
- The repeated section runs exactly three times.
- FSD stops at chapter boundaries.
- Active cell remains visually distinct from active row.
- Backlinks return to exact Ritual items.

### Mobile and PWA

- No horizontal page overflow at 320 CSS pixels.
- Controls remain tappable with one hand.
- Install prompt/installation works where supported.
- Offline reload succeeds after one online load.

## 10. Future Work

Potential improvements, requiring product confirmation before implementation:

- Persist Ritual completion state for interrupted rituals.
- Generalize repeated sections into explicit content metadata instead of marker inference.
- Add accessible announcements for FSD and timer state changes.
- Add deterministic browser tests for parsers, repetition, and timer transitions.
- Add a lightweight content validator for malformed indentation or tab counts.

## 11. AI Change Workflow

An AI agent starting from scratch should:

1. Read `README.md`, `AGENTS.md`, and this plan.
2. Inspect the two content assets before changing parser assumptions.
3. Identify whether a requested change is content, presentation, timing, PWA, or deployment behavior.
4. Make the smallest change that preserves static hosting and relative paths.
5. Increment the shared app/cache version for deployable changes.
6. Run static validation.
7. Serve locally and test the affected interaction at mobile width.
8. Report exact files changed, behavior verified, and any browser-only residual risk.
