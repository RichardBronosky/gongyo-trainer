function cleanLine(line) {
  return line.trimEnd();
}

const chapterLinks = [
  {
    label: "Chapter 2",
    href: "https://drive.google.com/file/d/1BZL3ZUecGybRFMzW5pLP12BJ5FEzxONg/view?usp=sharing",
  },
  {
    label: "Chapter 16",
    href: "https://drive.google.com/file/d/1T2mqTH3IqerrKSGJhrAp_LuKmHAldOqg/view?usp=sharing",
  },
];

const twoSyllableCells = new Set([
  "aku",
  "betsu",
  "buku",
  "butsu",
  "doku",
  "gaku",
  "gyaku",
  "hara",
  "hotsu",
  "hyaku",
  "ichi",
  "itsu",
  "jaku",
  "jiki",
  "jitsu",
  "kaku",
  "katsu",
  "koku",
  "metsu",
  "mitsu",
  "motsu",
  "noku",
  "oku",
  "raku",
  "riki",
  "roku",
  "setsu",
  "shaku",
  "shari",
  "shichi",
  "shitsu",
  "shutsu",
  "soku",
  "sui",
  "toku",
  "waku",
  "yaku",
  "yoku",
  "yui",
  "zui",
]);

function parseChapter(text, index) {
  const lines = text
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.trim() && !line.trim().startsWith("<!--"));
  const heading = lines.slice(0, index === 0 ? 2 : 3);
  const body = lines.slice(heading.length);

  return { heading, body };
}

function createSyllable(text) {
  const span = document.createElement("span");
  const value = text.trim();
  span.className = value ? "syllable" : "syllable blank";
  span.textContent = value || " ";
  if (twoSyllableCells.has(value.toLowerCase())) span.classList.add("two-syllable");
  return span;
}

function createLine(line, columns) {
  const row = document.createElement("div");
  const cells = line.split("\t");
  row.className = "syllable-line";
  row.dataset.columns = String(columns);
  row.style.setProperty("--columns", String(columns));

  while (cells.length < columns) cells.push("");
  cells.slice(0, columns).forEach((cell) => row.append(createSyllable(cell)));
  return row;
}

function createChapter(chapter, index) {
  const section = document.createElement("section");
  const header = document.createElement("div");
  const title = document.createElement("a");
  const headingLines = document.createElement("div");
  const lines = document.createElement("div");
  const ritualLink = document.createElement("a");
  const chapterNumber = index === 0 ? 2 : 16;

  section.className = "chapter";
  section.id = `chapter-${chapterNumber}`;
  header.className = "chapter-header";
  headingLines.className = "syllable-lines chapter-title-lines";
  lines.className = "syllable-lines";
  title.className = "chapter-link";
  title.textContent = chapterLinks[index]?.label || `#${index + 1}`;
  title.href = chapterLinks[index]?.href || "#";
  title.target = "_blank";
  title.rel = "noreferrer";
  ritualLink.className = "ritual-back-link";
  ritualLink.href = `ritual.html#ritual-chapter-${chapterNumber}`;
  ritualLink.textContent = "Back to ritual";

  chapter.heading.forEach((line) => headingLines.append(createLine(line, 5)));
  let columns = 5;
  chapter.body.forEach((line) => {
    lines.append(createLine(line, columns));
    if (/\[[ _]\]/.test(line)) columns = 7;
  });
  header.append(title);
  section.append(header, headingLines, lines, ritualLink);
  section.dataset.chapter = String(index + 1);
  return section;
}

async function loadSyllables() {
  const container = document.querySelector("[data-chapters]");
  const response = await fetch("assets/syllables.5-wide.txt");
  if (!response.ok) throw new Error(`Could not load syllables: ${response.status}`);

  const text = await response.text();
  const chapters = text.split(/^----$/m).map(parseChapter);
  container.replaceChildren(...chapters.map(createChapter));
  if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
}

loadSyllables().catch((error) => {
  const container = document.querySelector("[data-chapters]");
  container.textContent = error.message;
});

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function setupInstallPrompt() {
  const button = document.querySelector("[data-install-button]");
  const message = document.querySelector("[data-install-message]");
  let promptEvent = null;

  if (!button || !message) return;

  if (isStandalone()) {
    message.textContent = "Installed. This page is available offline after its first successful load.";
    return;
  }

  if (isIos()) {
    message.textContent = "To install on iPhone: Share -> Add to Home Screen. Offline works after this page finishes loading once.";
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    button.hidden = false;
    message.textContent = "Install this page for quick access and offline reading.";
  });

  button.addEventListener("click", async () => {
    if (!promptEvent) return;
    button.hidden = true;
    promptEvent.prompt();
    await promptEvent.userChoice;
    promptEvent = null;
    message.textContent = "Offline reading is ready after the app finishes caching this page.";
  });

  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    message.textContent = "Installed. Offline reading is enabled.";
  });
}

let rowTapHistory = [];
let fsdTimer = null;
let fsdCell = null;
let fsdState = null;
const MIN_BPM = 20;
const MAX_BPM = 240;
const MAX_RATE_CHANGE = 0.10;

function scrollRowToReadingPosition(row, behavior = "smooth") {
  const rect = row.getBoundingClientRect();
  const targetTop = window.innerHeight * 0.33;
  const nextScrollY = window.scrollY + rect.top - targetTop + rect.height / 2;
  window.scrollTo({ top: Math.max(0, nextScrollY), behavior });
}

function scrollRowKeepingRepeatControls(row, behavior = "smooth") {
  const chapter = row.closest(".chapter");
  const markerRow = [...chapter.querySelectorAll(".syllable-line")]
    .find((candidate) => checkboxCells(candidate).length > 0);
  if (!markerRow) return false;

  const margin = 12;
  const markerRect = markerRow.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const availableHeight = window.innerHeight - margin * 2;
  if (rowRect.bottom - markerRect.top > availableHeight) return false;

  let delta = 0;
  if (markerRect.top < margin) delta = markerRect.top - margin;
  if (rowRect.bottom - delta > window.innerHeight - margin) {
    delta += rowRect.bottom - delta - (window.innerHeight - margin);
  }
  if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior });
  return true;
}

function selectRow(row, behavior = "smooth", preserveRepeatControls = false) {
  document.querySelector(".syllable-line.selected-row")?.classList.remove("selected-row");
  row.classList.add("selected-row");
  if (preserveRepeatControls && scrollRowKeepingRepeatControls(row, behavior)) return;
  scrollRowToReadingPosition(row, behavior);
}

function updateFsdStatus(message, running = false) {
  const status = document.querySelector("[data-fsd-status]");
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle("running", running);
}

function updateRateBubble(bpm = null) {
  const bubble = document.querySelector("[data-rate-bubble]");
  if (!bubble) return;
  bubble.hidden = bpm === null;
  if (bpm !== null) bubble.textContent = `${bpm.toFixed(1)} BPM`;
}

function stopFsd(message = "FSD disengaged. Tap five consecutive rows to restart.") {
  if (fsdTimer !== null) window.clearTimeout(fsdTimer);
  fsdTimer = null;
  fsdCell?.classList.remove("fsd-active");
  fsdCell = null;
  fsdState = null;
  clearActiveRepeatIndicators();
  updateRateBubble();
  updateFsdStatus(message);
}

function rowDurationSeconds(bpm, columns) {
  return (60000 / bpm * columns) / 1000;
}

function isCheckboxCell(cell) {
  return /^\[(?:_| |-|X)\]$/.test(cell.textContent.trim());
}

function beatCells(row) {
  return [...row.querySelectorAll(".syllable")]
    .filter((cell) => !cell.classList.contains("blank") && !isCheckboxCell(cell));
}

function rowColumnCount(row) {
  return row ? beatCells(row).length : 0;
}

function checkboxCells(chapter) {
  return [...chapter.querySelectorAll(".syllable")].filter(isCheckboxCell);
}

function setRepeatIndicator(chapter, pass, active) {
  checkboxCells(chapter).forEach((cell, index) => {
    cell.textContent = index < pass ? "[X]" : index === pass ? (active ? "[-]" : "[X]") : "[_]";
  });
}

function clearActiveRepeatIndicators() {
  document.querySelectorAll(".syllable").forEach((cell) => {
    if (cell.textContent.trim() === "[-]") cell.textContent = "[_]";
  });
}

function buildPlaybackRows(startRow, startingRepeatPass = 0) {
  const chapter = startRow.closest(".chapter");
  const rows = [...chapter.querySelectorAll(".syllable-line")];
  const startIndex = rows.indexOf(startRow);
  const markerIndex = rows.findIndex((row) => checkboxCells(row).length > 0);
  const repeatStart = markerIndex + 1;
  const playbackRows = [];

  const appendRows = (from, to, repeatPass = null) => {
    for (let index = from; index <= to; index += 1) {
      const cells = beatCells(rows[index]);
      if (cells.length) playbackRows.push({ row: rows[index], cells, repeatPass, chapter });
    }
  };

  if (markerIndex >= 0 && startIndex < repeatStart) {
    appendRows(startIndex, markerIndex - 1);
    for (let pass = 0; pass < 3; pass += 1) appendRows(repeatStart, rows.length - 1, pass);
  } else if (markerIndex >= 0) {
    appendRows(startIndex, rows.length - 1, startingRepeatPass);
    for (let pass = startingRepeatPass + 1; pass < 3; pass += 1) {
      appendRows(repeatStart, rows.length - 1, pass);
    }
  } else {
    appendRows(startIndex, rows.length - 1);
  }

  return playbackRows;
}

function constrainBpm(candidate, current = null) {
  let constrained = Math.min(MAX_BPM, Math.max(MIN_BPM, candidate));
  if (current !== null) {
    constrained = Math.min(current * (1 + MAX_RATE_CHANGE), Math.max(current * (1 - MAX_RATE_CHANGE), constrained));
  }
  return constrained;
}

function startFsd(startRowIndex, bpm, statusLabel = "FSD engaged", startCellIndex = 0, repeatPass = 0) {
  const rows = [...document.querySelectorAll(".syllable-line")];
  const playbackRows = buildPlaybackRows(rows[startRowIndex], repeatPass);
  const intervalMs = 60000 / bpm;
  let playbackIndex = 0;
  let cellIndex = startCellIndex;
  let lastPlaybackIndex = -1;

  stopFsd();
  const columns = playbackRows[0]?.cells.length || 0;
  const rowStarts = new Map();
  let scheduledAt = performance.now() - startCellIndex * intervalMs;
  for (let index = 0; index < playbackRows.length; index += 1) {
    rowStarts.set(index, scheduledAt);
    scheduledAt += playbackRows[index].cells.length * intervalMs;
  }
  fsdState = {
    rows,
    playbackRows,
    rowStarts,
    startRowIndex,
    currentPlaybackIndex: 0,
    currentCellIndex: startCellIndex,
    bpm,
    intervalMs,
  };
  updateRateBubble(bpm);
  updateFsdStatus(
    `${statusLabel} | ${bpm.toFixed(1)} BPM | ${rowDurationSeconds(bpm, columns).toFixed(3)}s row`,
    true,
  );

  function advance() {
    fsdCell?.classList.remove("fsd-active");

    if (playbackIndex >= playbackRows.length) {
      stopFsd(`FSD complete | ${bpm.toFixed(1)} BPM`);
      return;
    }

    const playbackRow = playbackRows[playbackIndex];
    const { row, cells } = playbackRow;
    if (playbackIndex !== lastPlaybackIndex) {
      lastPlaybackIndex = playbackIndex;
      fsdState.currentPlaybackIndex = playbackIndex;
      selectRow(row, "smooth", playbackRow.repeatPass !== null);
      if (playbackRow.repeatPass !== null) {
        const makIndex = cells.findIndex((candidate) => candidate.textContent.trim().toLowerCase() === "mak");
        const alreadyPastMak = playbackIndex === 0 && makIndex >= 0 && cellIndex > makIndex;
        setRepeatIndicator(playbackRow.chapter, playbackRow.repeatPass, !alreadyPastMak);
      }
    }

    fsdState.currentCellIndex = cellIndex;
    fsdCell = cells[cellIndex];
    fsdCell?.classList.add("fsd-active");
    if (playbackRow.repeatPass !== null && fsdCell?.textContent.trim().toLowerCase() === "mak") {
      setRepeatIndicator(playbackRow.chapter, playbackRow.repeatPass, false);
    }
    cellIndex += 1;

    if (cellIndex >= cells.length) {
      playbackIndex += 1;
      cellIndex = 0;
    }

    fsdTimer = window.setTimeout(advance, intervalMs);
  }

  advance();
}

function calculateInitialSyllableBpm(taps) {
  const [first, second, third] = taps.slice(-3);
  const firstSyllableMs = (second.time - first.time) / first.columns;
  const secondSyllableMs = (third.time - second.time) / second.columns;
  return 60000 / ((firstSyllableMs + secondSyllableMs) / 2);
}

function calculatePhaseAdjustedSyllableBpm(expectedRowMs, phaseDeltaMs, columns) {
  const adjustedRowMs = expectedRowMs + phaseDeltaMs;
  if (adjustedRowMs <= 0) return null;
  return 60000 / (adjustedRowMs / columns);
}

function calculateWordAdjustedSyllableBpm(intervalMs, phaseDeltaMs, elapsedCells) {
  const observedIntervalMs = intervalMs + phaseDeltaMs / Math.max(1, elapsedCells);
  const splitIntervalMs = (intervalMs + observedIntervalMs) / 2;
  if (splitIntervalMs <= 0) return null;
  return 60000 / splitIntervalMs;
}

function adjustFsdFromTap(row, cell, tapTime) {
  if (!fsdState) return false;

  const rowIndex = fsdState.rows.indexOf(row);
  const currentPlaybackIndex = fsdState.currentPlaybackIndex;
  const currentPlaybackRow = fsdState.playbackRows[currentPlaybackIndex];
  const nextPlaybackRow = fsdState.playbackRows[currentPlaybackIndex + 1];
  const isCurrent = row === currentPlaybackRow?.row;
  const isNext = row === nextPlaybackRow?.row;
  const isCurrentOrNext = isCurrent || isNext;
  const targetPlaybackIndex = isCurrent ? currentPlaybackIndex : currentPlaybackIndex + 1;
  const scheduledStart = fsdState.rowStarts.get(targetPlaybackIndex);
  if (!isCurrentOrNext || scheduledStart === undefined) {
    return false;
  }

  if (isCurrent) {
    const cells = currentPlaybackRow.cells;
    const cellIndex = cells.indexOf(cell);
    if (cellIndex < 0) return false;
    const scheduledCellTime = scheduledStart + cellIndex * fsdState.intervalMs;
    const phaseDeltaMs = tapTime - scheduledCellTime;
    const candidateBpm = calculateWordAdjustedSyllableBpm(
      fsdState.intervalMs,
      phaseDeltaMs,
      cellIndex || fsdState.playbackRows[currentPlaybackIndex - 1]?.cells.length || cells.length,
    );
    if (!Number.isFinite(candidateBpm) || candidateBpm <= 0) return false;

    const bpm = constrainBpm(candidateBpm, fsdState.bpm);
    const phaseLabel = phaseDeltaMs < 0 ? "early" : "late";
    const limited = Math.abs(bpm - candidateBpm) > 0.001 ? ", limited" : "";
    const adjustment = `${Math.abs(phaseDeltaMs / 1000).toFixed(3)}s ${phaseLabel}, split${limited}`;
    startFsd(rowIndex, bpm, `FSD word adjust (${adjustment})`, cellIndex, currentPlaybackRow.repeatPass || 0);
    return true;
  }

  const columns = currentPlaybackRow.cells.length;
  const expectedRowMs = fsdState.intervalMs * columns;
  const phaseDeltaMs = tapTime - scheduledStart;
  const candidateBpm = calculatePhaseAdjustedSyllableBpm(expectedRowMs, phaseDeltaMs, columns);
  if (!Number.isFinite(candidateBpm) || candidateBpm <= 0) return false;
  const bpm = constrainBpm(candidateBpm, fsdState.bpm);

  const phaseLabel = phaseDeltaMs < 0 ? "early" : "late";
  const limited = Math.abs(bpm - candidateBpm) > 0.001 ? ", limited" : "";
  const adjustment = `${Math.abs(phaseDeltaMs / 1000).toFixed(3)}s ${phaseLabel}${limited}`;
  startFsd(rowIndex, bpm, `FSD adjusted (${adjustment})`, 0, nextPlaybackRow.repeatPass || 0);
  return true;
}

function recordRowTap(row) {
  const rows = [...document.querySelectorAll(".syllable-line")];
  const rowIndex = rows.indexOf(row);
  const chantRows = rows.filter((candidate) => rowColumnCount(candidate) > 0);
  const sequenceIndex = chantRows.indexOf(row);
  const previous = rowTapHistory.at(-1);
  const tap = {
    rowIndex,
    sequenceIndex,
    time: performance.now(),
    columns: rowColumnCount(row),
  };

  rowTapHistory = previous && sequenceIndex === previous.sequenceIndex + 1
    ? [...rowTapHistory, tap].slice(-5)
    : [tap];

  if (rowTapHistory.length < 5) {
    updateFsdStatus(`FSD calibration: ${rowTapHistory.length}/5 consecutive rows`);
    return;
  }

  const bpm = constrainBpm(calculateInitialSyllableBpm(rowTapHistory));

  rowTapHistory = [];
  if (Number.isFinite(bpm) && bpm > 0) startFsd(rowIndex, bpm);
}

function setupCellTaps() {
  document.addEventListener("click", (event) => {
    const cell = event.target.closest(".syllable");
    if (!cell) return;

    const row = cell.closest(".syllable-line");
    const value = cell.textContent.trim();
    if (value === "[_]" || value === "[ ]") {
      if (fsdState) stopFsd();
      rowTapHistory = [];
      cell.textContent = "[X]";
      selectRow(row);
      return;
    }
    if (value === "[X]" || value === "[-]") {
      if (fsdState) stopFsd();
      rowTapHistory = [];
      cell.textContent = "[_]";
      selectRow(row);
      return;
    }

    if (fsdState) {
      if (adjustFsdFromTap(row, cell, performance.now())) return;
      stopFsd();
      rowTapHistory = [];
    }

    selectRow(row);
    recordRowTap(row);
  });
}

function registerServiceWorker() {
  const message = document.querySelector("[data-install-message]");
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("sw.js").then((registration) => {
    if (isIos() || isStandalone()) return;
    message.textContent = registration.active
      ? "Offline cache is active. Install is available from your browser menu if no button appears."
      : "Preparing offline cache. Install is available from your browser menu if no button appears.";
  }).catch(() => {
    if (message) message.textContent = "Install may still work, but offline caching is not available in this browser.";
  });
}

document.querySelector("[data-rate-bubble]")?.addEventListener("click", () => {
  stopFsd();
  rowTapHistory = [];
});

setupInstallPrompt();
setupCellTaps();
registerServiceWorker();
