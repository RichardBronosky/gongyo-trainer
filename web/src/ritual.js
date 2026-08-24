function parseRitual(text) {
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

function chapterLink(text) {
  const match = text.match(/^Recite Chapter (2|16)\b/i);
  return match ? `syllables.html#chapter-${match[1]}` : null;
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
let timerItem = null;
let timerWakeLock = null;

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
    if (document.querySelector("[data-timer-overlay]").hidden || document.visibilityState !== "visible") {
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
}

function pauseRitualTimer() {
  checkpointTimer();
  if (timerInterval !== null) window.clearInterval(timerInterval);
  timerInterval = null;
  timerActiveSince = null;
  releaseTimerWakeLock();
  saveRitualState();
}

function closeRitualTimer() {
  invalidateSnapshot();
  pauseRitualTimer();
  const overlay = document.querySelector("[data-timer-overlay]");
  overlay.hidden = true;
  timerItem = null;
  saveRitualState();
}

function setItemCompleted(item, completed) {
  const checkbox = item.querySelector(":scope > .ritual-row .ritual-check");
  const toggle = item.querySelector(":scope > .ritual-row .ritual-toggle");
  if (checkbox) checkbox.checked = completed;
  item.classList.toggle("completed", completed);
  item.classList.toggle("collapsed", completed);
  if (toggle) {
    toggle.disabled = completed;
    toggle.textContent = completed ? "+" : "−";
    toggle.setAttribute("aria-expanded", String(!completed));
  }
}

function updateRitualTimer() {
  checkpointTimer();
  const overlay = document.querySelector("[data-timer-overlay]");
  const duration = ritualState.timer.minutes * 60 * 1000;
  const reached = ritualState.timer.elapsed >= duration;
  if (reached && ritualState.timer.alarm === "armed") {
    ritualState.timer.alarm = "flashing";
    if (!overlay.hidden) navigator.vibrate?.([300, 200, 300, 200, 600]);
  } else if (!reached && ritualState.timer.alarm !== "armed") {
    ritualState.timer.alarm = "armed";
  }

  overlay.classList.toggle("alarming", ritualState.timer.alarm === "flashing");
  document.querySelector("[data-timer-display]").value = reached
    ? formatTimer(ritualState.timer.elapsed, Math.floor)
    : formatTimer(duration - ritualState.timer.elapsed);
  document.querySelector("[data-timer-hint]").textContent = reached
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
  const value = Math.min(180, Math.max(1, ritualState.timer.minutes + minutes));
  if (value === ritualState.timer.minutes) return;
  invalidateSnapshot();
  ritualState.timer.minutes = value;
  const input = timerItem?.querySelector(".timer-minutes");
  if (input) input.value = String(value);
  updateRitualTimer();
}

function openRitualTimer(item) {
  invalidateSnapshot();
  timerItem = item;
  const overlay = document.querySelector("[data-timer-overlay]");
  overlay.hidden = false;
  if (document.visibilityState === "visible" && timerActiveSince === null) {
    timerActiveSince = Date.now();
    timerInterval = window.setInterval(updateRitualTimer, 250);
    acquireTimerWakeLock();
  }
  updateRitualTimer();
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
    const link = chapterLink(node.text);
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
        invalidateSnapshot();
        ritualState.timer.minutes = value;
        updateRitualTimer();
      });
      suffix.textContent = "min";
      label.append(prefix, input, suffix);
    } else if (link) {
      const anchor = document.createElement("a");
      const chapter = node.text.match(/Chapter (2|16)/i)[1];
      anchor.href = link;
      anchor.textContent = node.text;
      item.id = `ritual-chapter-${chapter}`;
      label.append(anchor);
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
        const collapsed = item.classList.toggle("collapsed");
        toggle.textContent = collapsed ? "+" : "−";
        toggle.setAttribute("aria-expanded", String(!collapsed));
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
        if (timerMatch) openRitualTimer(item);
        else checkbox.click();
      });
    }

    row.append(label);
    item.append(row);
    if (node.marker === "*") setItemCompleted(item, Boolean(ritualState.checks[ritualId]));
    if (hasChildren) item.append(renderNodes(node.children, path));
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
  const timerInput = document.querySelector(".timer-minutes");
  if (timerInput) timerInput.value = String(ritualState.timer.minutes);
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
  releaseTimerWakeLock();
  document.querySelector("[data-timer-overlay]").hidden = true;
  timerItem = null;

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
  updateResetLabel();
  if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
}

loadRitual().catch((error) => {
  document.querySelector("[data-ritual-tree]").textContent = error.message;
});

function registerServiceWorker() {
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
  }).catch((error) => {
    console.error("Service worker registration failed", error);
  });
}

registerServiceWorker();

document.querySelector("[data-ritual-reset]").addEventListener("click", resetRitual);

document.querySelector("[data-timer-back]").addEventListener("click", closeRitualTimer);

document.querySelector("[data-timer-minus]").addEventListener("click", () => adjustRitualTimer(-1));

document.querySelector("[data-timer-plus]").addEventListener("click", () => adjustRitualTimer(1));

document.querySelector("[data-timer-chill]").addEventListener("click", () => {
  invalidateSnapshot();
  ritualState.timer.alarm = "chilled";
  updateRitualTimer();
});

document.addEventListener("visibilitychange", () => {
  const overlay = document.querySelector("[data-timer-overlay]");
  if (document.visibilityState !== "visible") {
    pauseRitualTimer();
  } else if (!overlay.hidden && timerActiveSince === null) {
    timerActiveSince = Date.now();
    timerInterval = window.setInterval(updateRitualTimer, 250);
    updateRitualTimer();
    acquireTimerWakeLock();
  }
});
