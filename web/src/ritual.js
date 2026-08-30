export function parseRitual(text) {
  const root = { children: [] };
  const stack = [{ indent: -1, node: root }];
  const notes = [];

  text.split("\n").forEach((line) => {
    const match = line.match(/^(\s*)([*-])\s+(.+)$/);
    if (!match) {
      if (line.trim()) notes.push(line.trim());
      return;
    }

    const node = {
      marker: match[2],
      text: match[3],
      children: [],
    };
    const indent = match[1].length;
    while (stack.at(-1).indent >= indent) stack.pop();
    stack.at(-1).node.children.push(node);
    stack.push({ indent, node });
  });

  return { nodes: root.children, notes };
}

function chapterNumber(text) {
  const match = text.match(/^Recite Chapter (2|16)\b/i);
  return match?.[1] || null;
}

function renderNote(text) {
  const line = document.createElement("p");
  const parts = text.split(/(\p{Script=Han}+)/gu);
  parts.forEach((part) => {
    if (!part) return;
    if (/^\p{Script=Han}+$/u.test(part)) {
      const kanji = document.createElement("span");
      kanji.className = "kanji";
      kanji.textContent = part;
      line.append(kanji);
    } else {
      line.append(document.createTextNode(part));
    }
  });
  return line;
}

const RITUAL_STATE_KEY = "gongyo.ritualState";
const TIMER_MINUTES_KEY = "gongyo.daimokuMinutes";
const DEFAULT_TIMER = { minutes: 5, elapsed: 0, alarm: "armed" };
let timerInterval = null;
let timerActiveSince = null;
let timerHiddenAt = null;
let timerItem = null;
let timerWakeLock = null;
let ritualViewVisible = true;
let chapterCollapseHandler = () => {};
const chapterSlots = new Map();
const chapterItems = new Map();
let scrollableItemObserver = null;

function storedTimerMinutes() {
  try {
    const value = Number(localStorage.getItem(TIMER_MINUTES_KEY));
    return Number.isFinite(value) && value >= 1 && value <= 180 ? value : 5;
  } catch {
    return 5;
  }
}

function loadRitualState() {
  try {
    const stored = JSON.parse(localStorage.getItem(RITUAL_STATE_KEY));
    const timer = stored?.timer || {};
    const minutes = Number(timer.minutes);
    const elapsed = Number(timer.elapsed);
    const alarm = ["armed", "flashing", "chilled"].includes(timer.alarm) ? timer.alarm : "armed";
    return {
      checks: stored?.checks && typeof stored.checks === "object" ? stored.checks : {},
      timer: {
        minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 180 ? minutes : storedTimerMinutes(),
        elapsed: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0,
        alarm,
      },
      snapshot: stored?.snapshot || null,
      resetView: Boolean(stored?.snapshot && stored.resetView),
    };
  } catch {
    return { checks: {}, timer: { ...DEFAULT_TIMER, minutes: storedTimerMinutes() }, snapshot: null, resetView: false };
  }
}

let ritualState = loadRitualState();

function saveRitualState() {
  try {
    localStorage.setItem(RITUAL_STATE_KEY, JSON.stringify(ritualState));
    localStorage.setItem(TIMER_MINUTES_KEY, String(ritualState.timer.minutes));
  } catch {}
}

function invalidateSnapshot() {
  if (!ritualState.snapshot) return;
  ritualState.snapshot = null;
  ritualState.resetView = false;
  updateResetLabel();
}

function formatTimer(milliseconds, round = Math.ceil) {
  const totalSeconds = Math.max(0, round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function acquireTimerWakeLock() {
  try {
    const wakeLock = await navigator.wakeLock?.request("screen");
    if (!timerItem || timerItem.classList.contains("collapsed") || document.visibilityState !== "visible") {
      wakeLock?.release().catch(() => {});
    } else {
      timerWakeLock = wakeLock;
    }
  } catch {
    timerWakeLock = null;
  }
}

function releaseTimerWakeLock() {
  timerWakeLock?.release().catch(() => {});
  timerWakeLock = null;
}

function checkpointTimer() {
  if (timerActiveSince === null) return;
  const now = Date.now();
  ritualState.timer.elapsed += now - timerActiveSince;
  timerActiveSince = now;
  timerHiddenAt = now;
}

function pauseRitualTimer() {
  checkpointTimer();
  if (timerInterval !== null) window.clearInterval(timerInterval);
  timerInterval = null;
  timerActiveSince = null;
  releaseTimerWakeLock();
  if (document.querySelector("[data-timer-panel]")) updateRitualTimer();
  else saveRitualState();
}

function itemToggleButtons(item) {
  return [
    item.querySelector(":scope > .ritual-row .ritual-toggle"),
    item.querySelector(":scope > .ritual-bottom-control .ritual-bottom-toggle"),
  ].filter(Boolean);
}

function updateItemToggles(item) {
  const collapsed = item.classList.contains("collapsed");
  const completed = item.classList.contains("completed");
  itemToggleButtons(item).forEach((toggle) => {
    toggle.disabled = completed;
    toggle.textContent = collapsed ? "+" : "−";
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
}

function nextRitualRow(item) {
  let current = item;
  while (current) {
    if (current.nextElementSibling) {
      return current.nextElementSibling.querySelector(":scope > .ritual-row");
    }
    current = current.parentElement?.closest(".ritual-item");
  }
  return null;
}

function updateScrollableControl(item) {
  const control = item.querySelector(":scope > .ritual-bottom-control");
  if (!control) return;
  if (item.classList.contains("collapsed")) {
    control.hidden = true;
    item.classList.remove("scrollable-item");
    return;
  }
  const scrollable = item.getBoundingClientRect().height > window.innerHeight;
  control.hidden = !scrollable;
  item.classList.toggle("scrollable-item", scrollable);
}

function queueScrollableControlUpdate(item) {
  requestAnimationFrame(() => updateScrollableControl(item));
}

function setItemCollapsed(item, collapsed, proceed = false) {
  if (!item || item.classList.contains("collapsed") === collapsed) return;
  const nextRow = proceed ? nextRitualRow(item) : null;
  item.classList.toggle("collapsed", collapsed);
  updateItemToggles(item);
  updateScrollableControl(item);

  const chapter = item.dataset.ritualChapter;
  if (chapter) {
    if (collapsed) chapterCollapseHandler(chapter);
    else chapterItems.forEach((other, number) => {
      if (number !== chapter) setItemCollapsed(other, true);
    });
  }
  if (item === timerItem) {
    if (collapsed) pauseRitualTimer();
    else openRitualTimer();
  }

  if (!collapsed) queueScrollableControlUpdate(item);
  if (collapsed && proceed && nextRow) {
    requestAnimationFrame(() => {
      nextRow.scrollIntoView({ behavior: "smooth", block: "center" });
      nextRow.querySelector("input, button, a")?.focus({ preventScroll: true });
    });
  }
}

function setItemCompleted(item, completed) {
  const checkbox = item.querySelector(":scope > .ritual-row .ritual-check");
  if (checkbox) checkbox.checked = completed;
  item.classList.toggle("completed", completed);
  if (completed && item === timerItem) {
    ritualState.timer.elapsed = 0;
    ritualState.timer.alarm = "armed";
  }
  if (completed || item !== timerItem) setItemCollapsed(item, completed);
  updateItemToggles(item);
}

function updateRitualTimer() {
  checkpointTimer();
  const panel = document.querySelector("[data-timer-panel]");
  const duration = ritualState.timer.minutes * 60 * 1000;
  const reached = ritualState.timer.elapsed >= duration;
  if (reached && ritualState.timer.alarm === "armed") {
    ritualState.timer.alarm = "flashing";
    if (timerItem && !timerItem.classList.contains("collapsed")) navigator.vibrate?.([300, 200, 300, 200, 600]);
  } else if (!reached && ritualState.timer.alarm !== "armed") {
    ritualState.timer.alarm = "armed";
  }

  panel.classList.toggle("alarming", ritualState.timer.alarm === "flashing");
  document.querySelector("[data-timer-display]").value = reached
    ? formatTimer(ritualState.timer.elapsed, Math.floor)
    : formatTimer(duration - ritualState.timer.elapsed);
  document.querySelector("[data-timer-hint]").textContent = timerActiveSince === null
    ? "Timer paused"
    : reached
    ? ritualState.timer.alarm === "chilled" ? "Chilled · timer running" : "Duration reached · timer running"
    : "Timer running";
  document.querySelector("[data-timer-chill]").hidden = ritualState.timer.alarm !== "flashing";
  document.querySelector("[data-timer-clock]").value = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  saveRitualState();
}

function adjustRitualTimer(minutes) {
  if (ritualState.timer.alarm !== "armed") {
    invalidateSnapshot();
    ritualState.timer.alarm = "armed";
    ritualState.timer.elapsed = 0;
    timerActiveSince = Date.now();
    if (timerInterval === null && ritualViewVisible && document.visibilityState === "visible") {
      timerInterval = window.setInterval(updateRitualTimer, 250);
      acquireTimerWakeLock();
    }
    const input = timerItem?.querySelector(".timer-minutes");
    if (input) input.value = String(ritualState.timer.minutes);
    updateRitualTimer();
    return;
  }
  if (minutes < 0 && timerActiveSince !== null) {
    const newValue = Math.max(1, ritualState.timer.minutes + minutes);
    const duration = newValue * 60 * 1000;
    const remaining = duration - ritualState.timer.elapsed;
    if (remaining <= 0) {
      ritualState.timer.minutes = newValue;
      ritualState.timer.elapsed = duration - 2000;
      const input = timerItem?.querySelector(".timer-minutes");
      if (input) input.value = String(newValue);
      updateRitualTimer();
      return;
    }
  }
  const value = Math.min(180, Math.max(1, ritualState.timer.minutes + minutes));
  if (value === ritualState.timer.minutes) return;
  invalidateSnapshot();
  ritualState.timer.minutes = value;
  const input = timerItem?.querySelector(".timer-minutes");
  if (input) input.value = String(value);
  updateRitualTimer();
}

function focusRitualTimer() {
  const panel = document.querySelector("[data-timer-panel]");
  requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function openRitualTimer() {
  invalidateSnapshot();
  if (ritualViewVisible && document.visibilityState === "visible" && timerActiveSince === null
      && timerItem && !timerItem.classList.contains("collapsed")) {
    if (timerHiddenAt !== null) {
      const backgroundMs = Date.now() - timerHiddenAt;
      if (backgroundMs > 0) ritualState.timer.elapsed += backgroundMs;
      timerHiddenAt = null;
    }
    timerActiveSince = Date.now();
    timerInterval = window.setInterval(updateRitualTimer, 250);
    acquireTimerWakeLock();
  }
  updateRitualTimer();
  focusRitualTimer();
}

function collapseChapterItem(item) {
  setItemCollapsed(item, true);
}

function renderNodes(nodes, parentPath = []) {
  const list = document.createElement("ul");
  list.className = "ritual-list";

  nodes.forEach((node, index) => {
    const path = [...parentPath, index];
    const ritualId = path.join(".");
    const item = document.createElement("li");
    const row = document.createElement("div");
    const label = document.createElement("span");
    const hasChildren = node.children.length > 0;
    const chapter = chapterNumber(node.text);
    const timerMatch = node.text.match(/^(.*?)\s*\|__\|\s*(minutes.*)$/i);

    item.className = "ritual-item";
    item.dataset.ritualId = ritualId;
    row.className = "ritual-row";
    label.className = "ritual-label";

    if (timerMatch) {
      const prefix = document.createElement("span");
      const input = document.createElement("input");
      const suffix = document.createElement("span");

      label.classList.add("timer-label");
      prefix.textContent = timerMatch[1].trim();
      input.className = "timer-minutes";
      input.type = "number";
      input.min = "1";
      input.max = "180";
      input.step = "1";
      input.value = String(ritualState.timer.minutes);
      input.inputMode = "numeric";
      input.setAttribute("aria-label", "Daimoku minutes");
      input.addEventListener("change", () => {
        const value = Math.min(180, Math.max(1, Math.round(Number(input.value) || 5)));
        input.value = String(value);
        if (value === ritualState.timer.minutes) return;
        if (timerActiveSince !== null) {
          input.value = String(ritualState.timer.minutes);
          return;
        }
        invalidateSnapshot();
        ritualState.timer.minutes = value;
        updateRitualTimer();
      });
      suffix.textContent = "min";
      label.append(prefix, input, suffix);
    } else if (chapter) {
      item.id = `ritual-chapter-${chapter}`;
      item.dataset.ritualChapter = chapter;
      label.textContent = node.text;
    } else {
      label.textContent = node.text;
    }

    if (hasChildren) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ritual-toggle";
      toggle.textContent = "−";
      toggle.setAttribute("aria-expanded", "true");
      toggle.addEventListener("click", () => {
        setItemCollapsed(item, !item.classList.contains("collapsed"));
      });
      row.append(toggle);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "ritual-spacer";
      row.append(spacer);
    }

    if (node.marker === "*") {
      const checkbox = document.createElement("input");
      row.classList.add("checkable");
      checkbox.type = "checkbox";
      checkbox.className = "ritual-check";
      checkbox.setAttribute("aria-label", `Complete ${node.text}`);
      checkbox.addEventListener("change", () => {
        invalidateSnapshot();
        ritualState.checks[ritualId] = checkbox.checked;
        setItemCompleted(item, checkbox.checked);
        saveRitualState();
      });
      row.append(checkbox);
      row.addEventListener("click", (event) => {
        if (event.target.closest("a, button, input, select, textarea")) return;
        if (timerMatch) {
          if (item.classList.contains("collapsed")) setItemCollapsed(item, false);
          else focusRitualTimer();
        } else if (hasChildren && item.classList.contains("collapsed") && !checkbox.checked) {
          setItemCollapsed(item, false);
        } else {
          checkbox.click();
        }
      });
    }

    row.append(label);
    item.append(row);
    if (timerMatch) {
      const panel = document.querySelector("[data-timer-panel]");
      panel.hidden = false;
      item.append(panel);
    }
    if (node.marker === "*") setItemCompleted(item, Boolean(ritualState.checks[ritualId]));
    if (timerMatch) {
      item.classList.add("collapsed");
      timerItem = item;
      updateItemToggles(item);
    }
    if (chapter) {
      const slot = document.createElement("div");
      slot.className = "ritual-chapter-slot";
      slot.dataset.chapterSlot = chapter;
      item.append(slot);
      chapterSlots.set(chapter, slot);
      chapterItems.set(chapter, item);
      item.classList.add("collapsed");
      const toggle = row.querySelector(".ritual-toggle");
      if (toggle) {
        toggle.textContent = "+";
        toggle.setAttribute("aria-expanded", "false");
      }
    }
    if (hasChildren) item.append(renderNodes(node.children, path));
    if (hasChildren && !timerMatch) {
      const bottomControl = document.createElement("div");
      const bottomToggle = document.createElement("button");
      bottomControl.className = "ritual-bottom-control";
      bottomControl.hidden = true;
      bottomToggle.type = "button";
      bottomToggle.className = "ritual-bottom-toggle";
      bottomToggle.textContent = "−";
      bottomToggle.setAttribute("aria-expanded", "true");
      bottomToggle.setAttribute("aria-label", `Collapse ${node.text}`);
      bottomToggle.addEventListener("click", () => setItemCollapsed(item, true, true));
      bottomControl.append(bottomToggle);
      item.append(bottomControl);
    }
    list.append(item);
  });

  return list;
}

function ritualData() {
  return {
    checks: { ...ritualState.checks },
    timer: { ...ritualState.timer },
  };
}

function applyRitualData(data) {
  ritualState.checks = data.checks;
  ritualState.timer = data.timer;
  document.querySelectorAll("[data-ritual-id]").forEach((item) => {
    if (item.querySelector(":scope > .ritual-row .ritual-check")) {
      setItemCompleted(item, Boolean(ritualState.checks[item.dataset.ritualId]));
    }
  });
  chapterItems.forEach(collapseChapterItem);
  const timerInput = document.querySelector(".timer-minutes");
  if (timerInput) timerInput.value = String(ritualState.timer.minutes);
  updateRitualTimer();
}

function updateResetLabel() {
  document.querySelector("[data-ritual-reset]").textContent = ritualState.snapshot && ritualState.resetView
    ? "Restore"
    : "Reset";
}

function resetRitual() {
  checkpointTimer();
  if (timerInterval !== null) window.clearInterval(timerInterval);
  timerInterval = null;
  timerActiveSince = null;
  timerHiddenAt = null;
  releaseTimerWakeLock();
  if (timerItem) setItemCollapsed(timerItem, true);

  if (!ritualState.snapshot) {
    ritualState.snapshot = ritualData();
    ritualState.checks = {};
    ritualState.timer = { ...DEFAULT_TIMER };
    ritualState.resetView = true;
  } else {
    const current = ritualData();
    const previous = ritualState.snapshot;
    ritualState.snapshot = current;
    ritualState.checks = previous.checks;
    ritualState.timer = previous.timer;
    ritualState.resetView = !ritualState.resetView;
  }
  applyRitualData(ritualData());
  updateResetLabel();
  saveRitualState();
}

async function loadRitual() {
  const response = await fetch("assets/ritual.txt");
  if (!response.ok) throw new Error(`Could not load ritual: ${response.status}`);

  const { nodes, notes } = parseRitual(await response.text());
  document.querySelector("[data-ritual-tree]").replaceChildren(renderNodes(nodes));
  document.querySelector("[data-ritual-notes]").replaceChildren(...notes.map(renderNote));
  updateRitualTimer();
  updateResetLabel();
  const expandableItems = [...document.querySelectorAll(".ritual-bottom-control")]
    .map((control) => control.parentElement);
  if ("ResizeObserver" in window) {
    scrollableItemObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => updateScrollableControl(entry.target));
    });
    expandableItems.forEach((item) => scrollableItemObserver.observe(item));
  }
  window.addEventListener("resize", () => {
    expandableItems.forEach(queueScrollableControlUpdate);
  });
  return { chapterSlots, chapterItems };
}

let ritualInitialized = false;

export async function initRitual({ onChapterCollapse = () => {} } = {}) {
  chapterCollapseHandler = onChapterCollapse;
  if (ritualInitialized) return { chapterSlots, chapterItems };
  ritualInitialized = true;

  document.querySelector("[data-ritual-reset]").addEventListener("click", resetRitual);
  document.querySelector("[data-timer-minus]").addEventListener("click", () => adjustRitualTimer(-1));
  document.querySelector("[data-timer-plus]").addEventListener("click", () => adjustRitualTimer(1));
  document.querySelector("[data-timer-collapse]").addEventListener("click", () => {
    if (timerItem) setItemCollapsed(timerItem, true, true);
  });
  document.querySelector("[data-timer-panel]").addEventListener("click", (event) => {
    if (!event.target.closest("button, input, select, textarea")) focusRitualTimer();
  });
  document.querySelector("[data-timer-chill]").addEventListener("click", () => {
    invalidateSnapshot();
    ritualState.timer.alarm = "chilled";
    updateRitualTimer();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      pauseRitualTimer();
    } else {
      openRitualTimer();
    }
  });

  try {
    return await loadRitual();
  } catch (error) {
    document.querySelector("[data-ritual-tree]").textContent = error.message;
    throw error;
  }
}

export function setRitualViewVisible(visible) {
  ritualViewVisible = visible;
  if (!visible) {
    pauseRitualTimer();
  } else if (timerItem && !timerItem.classList.contains("collapsed")) {
    openRitualTimer();
  }
}
