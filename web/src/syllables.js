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

const chapterAudioSources = [
  "assets/chapter2_hoben-pon.no-bell.m4a",
  "assets/chapter16_juryo-hon.m4a",
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
  const controls = document.createElement("div");
  const clickToggle = document.createElement("label");
  const clickToggleInput = document.createElement("input");
  const clickToggleTrack = document.createElement("span");
  const clickToggleText = document.createElement("span");
  const headingLines = document.createElement("div");
  const lines = document.createElement("div");
  const ritualLink = document.createElement("a");
  const audioWrap = document.createElement("div");
  const audio = document.createElement("audio");
  const timingStatus = document.createElement("span");
  const timingActions = document.createElement("div");
  const copyTiming = document.createElement("button");
  const importTiming = document.createElement("button");
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
  controls.className = "chapter-controls";
  clickToggle.className = "click-track-toggle";
  clickToggleInput.type = "checkbox";
  clickToggleInput.setAttribute("role", "switch");
  clickToggleInput.dataset.clickTrackToggle = "";
  clickToggleInput.checked = clickTrackEnabled;
  clickToggleTrack.className = "click-track-switch";
  clickToggleTrack.setAttribute("aria-hidden", "true");
  clickToggleText.textContent = "Click track";
  clickToggle.append(clickToggleInput, clickToggleTrack, clickToggleText);
  audioWrap.className = "chapter-audio";
  audio.controls = true;
  audio.preload = "metadata";
  audio.src = chapterAudioSources[index];
  audio.dataset.chapterAudio = "";
  timingStatus.className = "timing-status";
  timingStatus.dataset.timingStatus = "";
  timingStatus.setAttribute("role", "status");
  timingStatus.setAttribute("aria-live", "polite");
  timingStatus.textContent = "No saved FSD timing";
  timingActions.className = "timing-actions";
  copyTiming.type = "button";
  copyTiming.className = "copy-timing";
  copyTiming.dataset.copyTiming = "";
  copyTiming.textContent = "Copy timing data";
  copyTiming.hidden = true;
  importTiming.type = "button";
  importTiming.className = "import-timing";
  importTiming.dataset.importTiming = "";
  importTiming.textContent = "Import timing data";
  timingActions.append(copyTiming, importTiming);
  audioWrap.append(audio, timingStatus, timingActions);
  ritualLink.className = "ritual-back-link";
  ritualLink.href = `ritual.html#ritual-chapter-${chapterNumber}`;
  ritualLink.textContent = "Back to ritual";

  chapter.heading.forEach((line) => headingLines.append(createLine(line, 5)));
  let columns = 5;
  chapter.body.forEach((line) => {
    lines.append(createLine(line, columns));
    if (/\[[ _]\]/.test(line)) columns = 7;
  });
  controls.append(clickToggle, audioWrap);
  header.append(title, controls);
  section.append(header, headingLines, lines, ritualLink);
  section.dataset.chapter = String(chapterNumber);
  section.querySelectorAll(".syllable-line").forEach((row, rowIndex) => {
    row.dataset.rowIndex = String(rowIndex);
  });
  return section;
}

async function loadSyllables() {
  const container = document.querySelector("[data-chapters]");
  const response = await fetch("assets/syllables.5-wide.txt");
  if (!response.ok) throw new Error(`Could not load syllables: ${response.status}`);

  const text = await response.text();
  const chapters = text.split(/^----$/m).map(parseChapter);
  container.replaceChildren(...chapters.map(createChapter));
  setupChapterAudio();
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
let audioFsdState = null;
let audioFsdTickStarted = false;
const CLICK_TRACK_STORAGE_KEY = "gongyo.clickTrack";
const CLICK_SCHEDULE_AHEAD_SECONDS = 0.15;
let clickTrackEnabled = loadClickTrackEnabled();
let clickAudioContext = null;
let scheduledClicks = [];
let recordedClickState = null;
let recordedClickTimer = null;
const MIN_BPM = 20;
const MAX_BPM = 240;
const MAX_RATE_CHANGE = 0.10;
const EDGE_TAP_WINDOW_MS = 450;
const TIMING_SCHEMA_VERSION = 1;

function loadClickTrackEnabled() {
  try {
    return localStorage.getItem(CLICK_TRACK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function ensureClickAudio() {
  if (!clickTrackEnabled) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!clickAudioContext) clickAudioContext = new AudioContext();
  if (clickAudioContext.state === "suspended") clickAudioContext.resume().catch(() => {});
  return clickAudioContext;
}

function scheduleClick(time) {
  const context = ensureClickAudio();
  if (!context) return;

  const startTime = Math.max(time, context.currentTime + 0.003);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.setValueAtTime(1400, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.16, startTime + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.03);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.035);

  const scheduled = { oscillator, startTime };
  scheduledClicks.push(scheduled);
  oscillator.addEventListener("ended", () => {
    scheduledClicks = scheduledClicks.filter((entry) => entry !== scheduled);
    oscillator.disconnect();
    gain.disconnect();
  }, { once: true });
}

function cancelScheduledClicks() {
  const context = clickAudioContext;
  scheduledClicks.forEach(({ oscillator }) => {
    try {
      oscillator.stop(context?.currentTime || 0);
    } catch {}
  });
  scheduledClicks = [];
}

function stopRecordedClicks() {
  if (recordedClickTimer !== null) window.clearInterval(recordedClickTimer);
  recordedClickTimer = null;
  recordedClickState = null;
  cancelScheduledClicks();
}

function scheduleRecordedClicks() {
  const state = recordedClickState;
  const context = clickAudioContext;
  if (!state || !context || context.state !== "running"
    || state.audio.paused || state.audio.seeking || !clickTrackEnabled) return;

  const mediaTime = state.audio.currentTime;
  const rate = state.audio.playbackRate;
  const mediaHorizon = mediaTime + CLICK_SCHEDULE_AHEAD_SECONDS * rate;
  while (state.nextIndex < state.beats.length && state.beats[state.nextIndex] <= mediaHorizon) {
    const beatTime = state.beats[state.nextIndex];
    state.nextIndex += 1;
    if (beatTime < mediaTime - 0.03) continue;
    scheduleClick(context.currentTime + (beatTime - mediaTime) / rate);
  }
}

function startRecordedClicks(audio, timing) {
  stopRecordedClicks();
  const context = ensureClickAudio();
  if (!context || audio.paused || !timing?.rows.length || fsdState) return;

  const beats = timing.rows.flatMap((row) => Array.from(
    { length: row.cellCount },
    (_, cellIndex) => row.timestamp + cellIndex * 60 / row.bpm,
  ));
  const nextIndex = beats.findIndex((time) => time >= audio.currentTime - 0.03);
  recordedClickState = {
    audio,
    beats,
    nextIndex: nextIndex < 0 ? beats.length : nextIndex,
  };
  scheduleRecordedClicks();
  recordedClickTimer = window.setInterval(scheduleRecordedClicks, 25);
}

function setClickTrackEnabled(enabled) {
  clickTrackEnabled = enabled;
  try {
    localStorage.setItem(CLICK_TRACK_STORAGE_KEY, String(enabled));
  } catch {}
  document.querySelectorAll("[data-click-track-toggle]").forEach((toggle) => {
    toggle.checked = enabled;
  });

  if (!enabled) {
    stopRecordedClicks();
    return;
  }
  ensureClickAudio();
  if (audioFsdState && !audioFsdState.audio.paused) {
    startRecordedClicks(audioFsdState.audio, audioFsdState.timing);
  }
}

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
  cancelScheduledClicks();
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

function timingStorageKey(chapter) {
  return `gongyo.fsd.chapter${chapter.dataset.chapter}`;
}

function invalidTiming(reason) {
  return { timing: null, reason };
}

function validateChapterTiming(chapter, timing) {
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) {
    return invalidTiming("timing data must be a JSON object");
  }
  if (timing.schemaVersion !== TIMING_SCHEMA_VERSION) {
    return invalidTiming(`unsupported schema version; expected ${TIMING_SCHEMA_VERSION}`);
  }

  const chapterNumber = Number(chapter.dataset.chapter);
  if (timing.chapter !== chapterNumber) {
    return invalidTiming(`timing is for Chapter ${timing.chapter ?? "unknown"}, not Chapter ${chapterNumber}`);
  }

  const audio = chapter.querySelector("[data-chapter-audio]");
  const expectedAudioSrc = audio?.getAttribute("src");
  if (typeof timing.audioSrc !== "string"
    || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(timing.audioSrc)) {
    return invalidTiming("audio source must be a relative URL");
  }
  if (timing.audioSrc !== expectedAudioSrc) {
    return invalidTiming(`audio source does not match Chapter ${chapterNumber}`);
  }
  if (!Number.isFinite(timing.bpm) || timing.bpm <= 0) {
    return invalidTiming("timing BPM must be a positive number");
  }

  const expectedRows = completeChapterPlaybackRows(chapter);
  if (!Array.isArray(timing.rows) || timing.rows.length === 0) {
    return invalidTiming("timing rows must be a non-empty array");
  }
  if (timing.rows.length !== expectedRows.length) {
    return invalidTiming(`row count does not match the current Chapter ${chapterNumber} structure`);
  }

  const invalidRowIndex = timing.rows.findIndex((row, index) => {
    const expected = expectedRows[index];
    const previous = timing.rows[index - 1];
    const expectedRepeatPass = expected.repeatPass;
    return !row || typeof row !== "object"
      || !Number.isInteger(row.sequenceIndex) || row.sequenceIndex !== index
      || !Number.isInteger(row.rowIndex) || row.rowIndex !== Number(expected.row.dataset.rowIndex)
      || (row.repeatPass === null
        ? expectedRepeatPass !== null
        : !Number.isInteger(row.repeatPass) || row.repeatPass < 0 || row.repeatPass >= 3
          || row.repeatPass !== expectedRepeatPass)
      || !Number.isFinite(row.timestamp)
      || (previous && row.timestamp < previous.timestamp)
      || !Number.isFinite(row.duration) || row.duration <= 0
      || !Number.isFinite(row.bpm) || row.bpm <= 0
      || !Number.isInteger(row.cellCount) || row.cellCount <= 0
      || row.cellCount !== expected.cells.length;
  });
  if (invalidRowIndex >= 0) {
    return invalidTiming(`row ${invalidRowIndex + 1} does not match the current Chapter ${chapterNumber} structure`);
  }
  return { timing, reason: null };
}

function loadChapterTiming(chapter) {
  try {
    const timing = JSON.parse(localStorage.getItem(timingStorageKey(chapter)));
    return validateChapterTiming(chapter, timing).timing;
  } catch {
    return null;
  }
}

function updateChapterTimingStatus(chapter, message = null) {
  const status = chapter.querySelector("[data-timing-status]");
  if (!status) return;
  const timing = loadChapterTiming(chapter);
  const copyTiming = chapter.querySelector("[data-copy-timing]");
  if (copyTiming) copyTiming.hidden = !timing;
  status.textContent = message || (timing
    ? `Saved timing: ${timing.rows.length} rows | ${timing.bpm.toFixed(1)} BPM`
    : "No saved FSD timing");
}

async function copyChapterTiming(chapter) {
  const timing = loadChapterTiming(chapter);
  if (!timing) return;
  const text = JSON.stringify(timing, null, 2);
  let copied = false;
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
  }
  if (!copied) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    copied = document.execCommand("copy");
    textarea.remove();
  }
  if (!copied) throw new Error("Clipboard copy failed");
  updateChapterTimingStatus(chapter, `Copied Chapter ${chapter.dataset.chapter} timing data`);
}

async function readTimingImportText(chapter) {
  if (navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) return text;
    } catch {}
  }
  return window.prompt(`Paste Chapter ${chapter.dataset.chapter} timing JSON:`);
}

async function importChapterTiming(chapter) {
  const chapterNumber = Number(chapter.dataset.chapter);
  const text = await readTimingImportText(chapter);
  if (text === null) {
    updateChapterTimingStatus(chapter, "Timing import cancelled");
    return;
  }

  let timing;
  try {
    timing = JSON.parse(text);
  } catch {
    updateChapterTimingStatus(chapter, "Import rejected: invalid JSON");
    return;
  }

  const validation = validateChapterTiming(chapter, timing);
  if (!validation.timing) {
    updateChapterTimingStatus(chapter, `Import rejected: ${validation.reason}`);
    return;
  }

  if (loadChapterTiming(chapter)
    && !window.confirm(`Replace valid saved timing for Chapter ${chapterNumber} with imported Chapter ${timing.chapter} timing?`)) {
    updateChapterTimingStatus(chapter, "Timing import cancelled; saved timing unchanged");
    return;
  }

  try {
    localStorage.setItem(timingStorageKey(chapter), JSON.stringify(validation.timing));
    updateChapterTimingStatus(chapter,
      `Imported Chapter ${chapterNumber} timing: ${timing.rows.length} rows | ${timing.bpm.toFixed(1)} BPM`);
    const audio = chapter.querySelector("[data-chapter-audio]");
    if (audio && !audio.paused) {
      startAudioFsd(chapter, audio, validation.timing);
      renderAudioFsd();
    }
  } catch {
    updateChapterTimingStatus(chapter, "Could not save imported timing");
  }
}

function completeChapterPlaybackRows(chapter) {
  const firstRow = [...chapter.querySelectorAll(".syllable-line")]
    .find((row) => beatCells(row).length > 0);
  return firstRow ? buildPlaybackRows(firstRow) : [];
}

function calculateTimelineRows(fullRows, anchorIndex, audioTime, startCellIndex, bpm) {
  const intervalSeconds = 60 / bpm;
  const cellsBeforeAnchor = fullRows.slice(0, anchorIndex)
    .reduce((total, entry) => total + entry.cells.length, 0);
  let timestamp = audioTime - startCellIndex * intervalSeconds
    - cellsBeforeAnchor * intervalSeconds;
  return fullRows.map((entry, sequenceIndex) => {
    const duration = entry.cells.length * intervalSeconds;
    const rowTiming = {
      sequenceIndex,
      rowIndex: Number(entry.row.dataset.rowIndex),
      repeatPass: entry.repeatPass,
      timestamp,
      bpm,
      cellCount: entry.cells.length,
      duration,
    };
    timestamp += duration;
    return rowTiming;
  });
}

function persistFsdTiming(state, startCellIndex) {
  const chapter = state.playbackRows[0]?.chapter;
  const audio = chapter?.querySelector("[data-chapter-audio]");
  if (!chapter || !audio || audio.paused) return;

  const fullRows = completeChapterPlaybackRows(chapter);
  const anchor = state.playbackRows[0];
  const anchorIndex = fullRows.findIndex((entry) => entry.row === anchor.row
    && entry.repeatPass === anchor.repeatPass);
  if (anchorIndex < 0) return;

  const rows = calculateTimelineRows(fullRows, anchorIndex, audio.currentTime, startCellIndex, state.bpm);

  const timing = {
    schemaVersion: TIMING_SCHEMA_VERSION,
    chapter: Number(chapter.dataset.chapter),
    audioSrc: audio.getAttribute("src"),
    audioDuration: Number.isFinite(audio.duration) ? audio.duration : null,
    bpm: state.bpm,
    updatedAt: new Date().toISOString(),
    rows,
  };
  try {
    localStorage.setItem(timingStorageKey(chapter), JSON.stringify(timing));
    updateChapterTimingStatus(chapter, `Timing saved: ${rows.length} rows | ${state.bpm.toFixed(1)} BPM`);
  } catch {
    updateChapterTimingStatus(chapter, "Could not save FSD timing");
  }
}

function stopAudioFsd() {
  if (!audioFsdState) return;
  stopRecordedClicks();
  fsdCell?.classList.remove("fsd-active");
  fsdCell = null;
  audioFsdState = null;
  clearActiveRepeatIndicators();
  updateRateBubble();
}

function startAudioFsd(chapter, audio, timing) {
  if (!timing?.rows.length) return;
  stopAudioFsd();
  if (fsdState) stopFsd("Audio timing engaged");
  audioFsdState = {
    chapter,
    audio,
    timing,
    currentSequenceIndex: -1,
    currentCellIndex: -1,
  };
  startRecordedClicks(audio, timing);
  updateChapterTimingStatus(chapter, `Audio FSD | ${timing.rows.length} rows | ${timing.bpm.toFixed(1)} BPM`);
  updateRateBubble(timing.bpm);
}

function showAudioFsdBeforeStart(chapter, timing, state = null) {
  fsdCell?.classList.remove("fsd-active");
  fsdCell = null;
  document.querySelector(".syllable-line.selected-row")?.classList.remove("selected-row");
  if (state) {
    state.currentSequenceIndex = -1;
    state.currentCellIndex = -1;
  }
  checkboxCells(chapter).forEach((cell) => { cell.textContent = "[_]"; });
  updateChapterTimingStatus(chapter, `FSD starts at ${timing.rows[0].timestamp.toFixed(3)}s`);
}

function renderAudioFsd() {
  const state = audioFsdState;
  if (!state || state.audio.paused) return;

  const time = state.audio.currentTime;
  const rows = state.timing.rows;
  let sequenceIndex = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].timestamp <= time) sequenceIndex = index;
    else break;
  }
  if (sequenceIndex < 0) {
    showAudioFsdBeforeStart(state.chapter, state.timing, state);
    return;
  }

  const rowTiming = rows[sequenceIndex];
  if (time >= rowTiming.timestamp + rowTiming.duration && sequenceIndex === rows.length - 1) {
    stopAudioFsd();
    updateChapterTimingStatus(state.chapter, "Audio FSD complete");
    return;
  }

  const row = state.chapter.querySelector(`.syllable-line[data-row-index="${rowTiming.rowIndex}"]`);
  const cells = beatCells(row);
  const interval = 60 / rowTiming.bpm;
  const cellIndex = Math.min(cells.length - 1, Math.max(0, Math.floor((time - rowTiming.timestamp) / interval)));
  if (sequenceIndex !== state.currentSequenceIndex) {
    state.currentSequenceIndex = sequenceIndex;
    selectRow(row, "smooth", rowTiming.repeatPass !== null);
    if (rowTiming.repeatPass !== null) setRepeatIndicator(state.chapter, rowTiming.repeatPass, true);
    else checkboxCells(state.chapter).forEach((cell) => { cell.textContent = "[_]"; });
  }
  if (cellIndex !== state.currentCellIndex || fsdCell !== cells[cellIndex]) {
    state.currentCellIndex = cellIndex;
    fsdCell?.classList.remove("fsd-active");
    fsdCell = cells[cellIndex];
    fsdCell?.classList.add("fsd-active");
    if (rowTiming.repeatPass !== null && fsdCell?.textContent.trim().toLowerCase() === "mak") {
      setRepeatIndicator(state.chapter, rowTiming.repeatPass, false);
    }
  }
  updateRateBubble(rowTiming.bpm);
}

function syncAudioFsd(chapter, audio) {
  const state = audioFsdState?.audio === audio ? audioFsdState : null;
  const timing = state?.timing || loadChapterTiming(chapter);
  if (!timing) return;
  if (audio.currentTime < timing.rows[0].timestamp) {
    showAudioFsdBeforeStart(chapter, timing, state);
    return;
  }
  if (audio.paused) return;
  if (!state) startAudioFsd(chapter, audio, timing);
  renderAudioFsd();
}

function audioFsdTick() {
  renderAudioFsd();
  requestAnimationFrame(audioFsdTick);
}

function setupChapterAudio() {
  document.querySelectorAll(".chapter").forEach((chapter) => {
    const audio = chapter.querySelector("[data-chapter-audio]");
    updateChapterTimingStatus(chapter);
    chapter.querySelector("[data-click-track-toggle]").addEventListener("change", (event) => {
      setClickTrackEnabled(event.currentTarget.checked);
    });
    audio.addEventListener("play", () => {
      ensureClickAudio();
      document.querySelectorAll("[data-chapter-audio]").forEach((other) => {
        if (other !== audio) other.pause();
      });
      const timing = loadChapterTiming(chapter);
      if (timing) {
        startAudioFsd(chapter, audio, timing);
        renderAudioFsd();
      }
      else updateChapterTimingStatus(chapter, "Play and tap 5 rows to calibrate FSD");
    });
    audio.addEventListener("pause", () => {
      if (audioFsdState?.audio === audio) stopAudioFsd();
      if (fsdState?.chapter === chapter) stopFsd();
      updateChapterTimingStatus(chapter);
    });
    audio.addEventListener("seeking", () => {
      stopRecordedClicks();
      syncAudioFsd(chapter, audio);
    });
    audio.addEventListener("seeked", () => {
      syncAudioFsd(chapter, audio);
      if (audioFsdState?.audio === audio && !audio.paused) {
        startRecordedClicks(audio, audioFsdState.timing);
      }
    });
    audio.addEventListener("ratechange", () => {
      if (audioFsdState?.audio === audio && !audio.paused) {
        startRecordedClicks(audio, audioFsdState.timing);
      }
    });
    audio.addEventListener("ended", () => {
      if (audioFsdState?.audio === audio) stopAudioFsd();
      updateChapterTimingStatus(chapter);
    });
    audio.addEventListener("loadedmetadata", () => updateChapterTimingStatus(chapter));
    chapter.querySelector("[data-copy-timing]").addEventListener("click", () => {
      copyChapterTiming(chapter).catch(() => updateChapterTimingStatus(chapter, "Could not copy timing data"));
    });
    chapter.querySelector("[data-import-timing]").addEventListener("click", () => {
      importChapterTiming(chapter).catch(() => updateChapterTimingStatus(chapter, "Could not import timing data"));
    });
  });
  if (!audioFsdTickStarted) {
    audioFsdTickStarted = true;
    requestAnimationFrame(audioFsdTick);
  }
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

  stopAudioFsd();
  stopRecordedClicks();
  stopFsd();
  ensureClickAudio();
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
    chapter: playbackRows[0]?.chapter,
  };
  persistFsdTiming(fsdState, startCellIndex);
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
    if (fsdCell) scheduleClick(clickAudioContext?.currentTime || 0);
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
  const previousPlaybackRow = fsdState.playbackRows[currentPlaybackIndex - 1];
  const currentScheduledStart = fsdState.rowStarts.get(currentPlaybackIndex);
  const timeSinceTransition = tapTime - currentScheduledStart;
  const adjacentRaceTap = timeSinceTransition >= 0
    && timeSinceTransition <= EDGE_TAP_WINDOW_MS
    && (row === previousPlaybackRow?.row || row === nextPlaybackRow?.row);

  if (adjacentRaceTap && previousPlaybackRow) {
    const columns = previousPlaybackRow.cells.length;
    const expectedRowMs = fsdState.intervalMs * columns;
    const candidateBpm = calculatePhaseAdjustedSyllableBpm(expectedRowMs, timeSinceTransition, columns);
    if (!Number.isFinite(candidateBpm) || candidateBpm <= 0) return false;
    const bpm = constrainBpm(candidateBpm, fsdState.bpm);
    const limited = Math.abs(bpm - candidateBpm) > 0.001 ? ", limited" : "";
    const currentRowIndex = fsdState.rows.indexOf(currentPlaybackRow.row);
    startFsd(
      currentRowIndex,
      bpm,
      `FSD edge correction (${(timeSinceTransition / 1000).toFixed(3)}s late${limited})`,
      0,
      currentPlaybackRow.repeatPass || 0,
    );
    return true;
  }

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
    if (audioFsdState) {
      stopAudioFsd();
      rowTapHistory = [];
    }
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

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.setTimeout(() => location.reload(), 1000);
  });

  navigator.serviceWorker.register("sw.js").then((registration) => {
    registration.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
    if (isIos() || isStandalone()) return;
    message.textContent = registration.active
      ? "Offline cache is active. Install is available from your browser menu if no button appears."
      : "Preparing offline cache. Install is available from your browser menu if no button appears.";
  }).catch(() => {
    if (message) message.textContent = "Install may still work, but offline caching is not available in this browser.";
  });
}

document.querySelector("[data-rate-bubble]")?.addEventListener("click", () => {
  if (audioFsdState) {
    audioFsdState.audio.pause();
    stopAudioFsd();
  } else {
    stopFsd();
  }
  rowTapHistory = [];
});

setupInstallPrompt();
setupCellTaps();
registerServiceWorker();
