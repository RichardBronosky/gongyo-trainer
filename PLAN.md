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

### Product Focus

Gongyo Trainer exists to help a practitioner learn, rehearse, and perform the Buddhist practice of Gongyo with decreasing dependence on the application. A feature belongs in this project when it directly improves learning, pacing, ritual continuity, accessibility, or ownership of personal practice data.

## 2. Non-Goals

Do not add the following to this repository:

- Video files or audio files other than approved M4A runtime assets under `web/assets/`.
- Timing-review or splice-review interfaces.
- Beat collection data or reconciliation tools.
- Deployed servers, backends, or APIs. The local-only server under `internal/` is development tooling.
- User accounts, hosted storage, cloud synchronization, telemetry, or analytics.
- General-purpose media, personalization, or project-management systems.
- Generated media artifacts.
- Frameworks, package managers, bundlers, or runtime dependencies unless a future requirement cannot reasonably be met with browser APIs.

External Google Drive chapter links are intentional references and are not application runtime assets.

## 3. Current Product

### Ritual View

The canonical SPA at `web/index.html?view=ritual` loads and parses `web/assets/ritual.txt`.

Behavior:

- Indentation creates nested list structure.
- Lines beginning with `*` are completable top-level ritual actions.
- Lines beginning with `-` are nested explanatory/action items without checkboxes.
- Parent items have explicit expand/collapse controls.
- Expanded Ritual items taller than the viewport mirror their collapse control at the bottom so the next step is reachable without reverse scrolling.
- Completing a parent collapses its descendants.
- Completion state persists locally until the practitioner uses the Ritual reset control.
- Reset clears completion and Daimoku timer state immediately; until any restored value is changed, tapping it again swaps between the reset and previous state.
- Each recitation parent expands its canonical chapter section directly after the recitation row and before Sound Bell.
- Ritual chapters default collapsed, only one can be manually expanded, and manual collapse state is not persisted.
- Collapsing or completing a recitation pauses its chapter audio and disengages FSD without resetting its playhead.
- Non-list lines render as notes below the checklist.
- Kanji runs render at three times the surrounding text size.

The Daimoku line contains a timer placeholder:

```text
* Daimoku |__| minutes
```

The renderer replaces the placeholder with:

- A persisted numeric minute selector.
- A normal completion checkbox independent from the timer.
- A full-screen countdown with add/subtract minute controls.
- Row-tap start/resume behavior that runs only while the timer and browser tab are visible.
- Persisted active elapsed time that pauses when the timer is hidden.
- A flashing black/white completion state that continues counting total active time.
- A Chill control that stops flashing without stopping or closing the timer.
- The current local time.

Ritual completion, timer, and temporary reset/restore state are stored locally. The selected minute value remains mirrored under `localStorage` key `gongyo.daimokuMinutes`.

### Trainer View

`web/index.html?view=trainer` loads and parses `web/assets/syllables.5-wide.txt`.

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

Chapter labels link to the externally hosted reference files. Each chapter ends with a link back to its exact Ritual checklist item; this link is hidden while that chapter is embedded in Ritual.

Each chapter is rendered and bound once. The canonical chapter section is moved with DOM `append()` between its Trainer deck slot and matching Ritual recitation slot. View changes do not intentionally pause audio or FSD, so playback continues where browser reparenting permits.

Each chapter also has native audio controls backed by its approved relative M4A asset. Playback supports pause, resume, and timeline seeking; only one chapter plays at a time. Pausing removes the active FSD highlight without resetting the audio playhead, and resumed or seeked playback follows `audio.currentTime` using saved timing.

Each chapter header also contains the same persisted Click track switch. The switches remain synchronized and produce one synthesized click per FSD beat during both live FSD and saved-timing audio playback. Recorded-audio clicks are scheduled against `audio.currentTime`, including seeking, playback-rate changes, and repeated Chapter 2 passes.

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

### Personalization and Data Ownership

- Timing personalization is local-first and belongs to the practitioner.
- Timing data can be exported as human-readable JSON and imported on another origin, browser, or device.
- Import is available beside the copy action and accepts pasted or clipboard JSON.
- Before replacing saved timing, an import must validate its schema version, chapter, relative audio source, and current chapter structure, then confirm the destination chapter with the practitioner.
- Invalid data must leave known-good timing unchanged and report why it was rejected.
- A successful import stores the timing under the chapter's existing `localStorage` key and immediately refreshes its timing status.
- Personal timing data is never committed to the repository. Shared default timing would require a separate explicit product decision.
- Personalization does not require accounts, uploads, telemetry, a backend, or cloud synchronization.

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
- `web/index.html`: Canonical SPA shell with shared header, view selector, both view hosts, timer, and global FSD UI.
- `web/ritual.html`: Legacy Ritual redirect alias that preserves hashes.
- `web/syllables.html`: Legacy Trainer redirect alias that preserves hashes.
- `web/src/app.js`: Initialization, view placement, History API routing, installation, and service-worker lifecycle.
- `web/src/app.css`: Shared shell, header, and view-selector presentation.
- `web/src/ritual.js`: ES module for Ritual parsing, rendering, timer, checklist behavior, and chapter slots.
- `web/src/ritual.css`: Ritual layout and timer presentation.
- `web/src/syllables.js`: ES module for canonical chapter rendering, audio, and chapter-local FSD timing.
- `web/src/syllables.css`: Trainer grid, highlights, responsive presentation.
- `web/manifest.webmanifest`: Install metadata.
- `web/sw.js`: Offline app-shell cache.
- `web/assets/`: Runtime content, icons, and approved M4A audio only.
- `docs/`: Human/AI reference material that is not fetched at runtime.
- `internal/server.py`: Local-only no-cache, byte-range development server behind `tools.sh`.
- `tools.sh`: Sole user-facing entry point for local development tools.

All runtime URLs must remain relative so the app works below the GitHub Pages project path `/gongyo-trainer/`.
The deployed application remains entirely static: `.github/workflows/pages.yml` publishes only `web/`, never `internal/` or other repository tooling.
Development conveniences must remain subordinate to the practitioner-facing application and must not introduce production services or runtime dependencies.

## 7. Offline and Versioning Contract

The service worker installs the versioned critical app shell atomically. Approved M4A files are runtime assets rather than install-blocking app-shell entries. Same-origin byte-range requests bypass the Cache API so audio seeking can receive partial responses; navigations are network-first with exact-page and canonical `index.html` offline fallbacks, including query-bearing SPA URLs, while other same-origin resources use the current cache with exact-key cache-first runtime filling.

For every deployable change:

1. Increment `CACHE_NAME` in `web/sw.js`.
2. Update the visible `vN` in `web/index.html`.
3. Add any new install-critical runtime file to `APP_SHELL`. Large seekable M4A files may be intentionally excluded so service-worker activation is not blocked by audio downloads.
4. Confirm every `APP_SHELL` path exists.
5. Load once online, then verify both SPA views and their install-critical content while offline. M4A files excluded from `APP_SHELL` are not part of this activation-time offline guarantee.

Do not add random cache-busting query strings. Stable URLs are required for deterministic offline matching.

## 8. GitHub Pages Deployment

`.github/workflows/pages.yml` publishes only `web/`. Root documentation and repository metadata are never included in the Pages artifact.

Required repository configuration:

- Default branch: `main`.
- Pages source: GitHub Actions.
- Workflow permissions: Pages write and OIDC token write.
- No custom domain is required initially.

Deployment acceptance:

- Root project URL opens the SPA in Ritual view.
- Ritual and Trainer History API navigation works under `/gongyo-trainer/`.
- Manifest and icons load without 404s.
- Service worker scope is the project directory.
- Installed app opens Ritual by default.

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
- Recitation links navigate to the correct Trainer anchor; parent toggles embed the chapter before Sound Bell.
- Only one Ritual chapter is expanded, and collapse/completion pauses audio and disengages FSD while preserving the playhead.
- Timer minutes survive refresh and cache upgrades.
- Ritual completion and timer progress survive refresh and cache upgrades until reset.
- The timer advances only while its overlay and browser tab are visible.
- Minus-to-zero enters flashing completion mode without losing total active time.
- Chill stops flashing while total active time continues.
- Reset and restore swap states until the practitioner changes a restored value.

### Trainer

- Both chapters render from the text asset.
- Five/seven-column transition occurs after the marker row.
- Empty and marker cells receive no FSD beat.
- The repeated section runs exactly three times.
- FSD stops at chapter boundaries.
- Active cell remains visually distinct from active row.
- Backlinks switch views and return to exact Ritual items.
- Switching views reparents, rather than recreates, chapters and does not intentionally interrupt active playback/FSD.
- Both Click track switches remain synchronized.
- Clicks follow live FSD and saved audio timing through pause, seek, rate, and repeated-section transitions.

### Mobile and PWA

- No horizontal page overflow at 320 CSS pixels.
- Controls remain tappable with one hand.
- Install prompt/installation works where supported.
- Offline reload succeeds after one online load.

## 10. Future Work

Potential improvements, requiring product confirmation before implementation:

- Generalize repeated sections into explicit content metadata instead of marker inference.
- Add accessible announcements for FSD and timer state changes.
- Add deterministic browser tests for parsers, repetition, and timer transitions.
- Add a lightweight content validator for malformed indentation or tab counts.

## 11. AI Change Workflow

An AI agent starting from scratch should:

1. Read `README.md`, `AGENTS.md`, and this plan.
2. Inspect the two content assets before changing parser assumptions.
3. Identify whether a requested change is content, presentation, timing, SPA routing, PWA, or deployment behavior.
4. Make the smallest change that preserves static hosting and relative paths.
5. Increment the shared app/cache version for deployable changes.
6. Run static validation.
7. Serve locally and test the affected interaction at mobile width.
8. Report exact files changed, behavior verified, and any browser-only residual risk.
