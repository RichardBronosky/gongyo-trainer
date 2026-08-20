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

let timerInterval = null;
let timerTarget = 0;
let timerItem = null;
let timerWakeLock = null;
const TIMER_MINUTES_KEY = "gongyo.daimokuMinutes";

function storedTimerMinutes() {
  try {
    const value = Number(localStorage.getItem(TIMER_MINUTES_KEY));
    return Number.isFinite(value) && value >= 1 && value <= 180 ? value : 5;
  } catch {
    return 5;
  }
}

function storeTimerMinutes(value) {
  if (!Number.isFinite(value) || value < 1 || value > 180) return;
  try {
    localStorage.setItem(TIMER_MINUTES_KEY, String(value));
  } catch {}
}

function formatTimer(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function acquireTimerWakeLock() {
  try {
    timerWakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    timerWakeLock = null;
  }
}

function releaseTimerWakeLock() {
  timerWakeLock?.release().catch(() => {});
  timerWakeLock = null;
}

function cancelRitualTimer() {
  if (timerInterval !== null) window.clearInterval(timerInterval);
  timerInterval = null;
  timerTarget = 0;
  timerItem = null;
  releaseTimerWakeLock();

  const overlay = document.querySelector("[data-timer-overlay]");
  overlay.classList.remove("alarming");
  overlay.hidden = true;
}

function setTimerItemCompleted(item, completed) {
  if (!item) return;
  const toggle = item.querySelector(":scope > .ritual-row .ritual-toggle");
  const hourglass = item.querySelector(".ritual-timer-check");
  item.classList.toggle("completed", completed);
  item.classList.toggle("collapsed", completed);
  if (toggle) {
    toggle.disabled = completed;
    toggle.textContent = completed ? "+" : "−";
    toggle.setAttribute("aria-expanded", String(!completed));
  }
  if (hourglass) {
    hourglass.textContent = completed ? "⌛" : "⏳";
    hourglass.setAttribute("aria-label", completed ? "Daimoku timer complete" : "Start Daimoku timer");
  }
}

function finishRitualTimer() {
  if (timerInterval !== null) window.clearInterval(timerInterval);
  timerInterval = null;

  const overlay = document.querySelector("[data-timer-overlay]");
  overlay.classList.add("alarming");
  document.querySelector("[data-timer-display]").value = "00:00";
  document.querySelector("[data-timer-hint]").textContent = "Tap the screen to continue";
  document.querySelector("[data-timer-controls]").hidden = true;
  navigator.vibrate?.([300, 200, 300, 200, 600]);
}

function updateRitualTimer() {
  const remaining = timerTarget - Date.now();
  document.querySelector("[data-timer-display]").value = formatTimer(remaining);
  if (remaining <= 0) finishRitualTimer();
}

function startRitualTimer(minutes, item) {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  storeTimerMinutes(minutes);
  cancelRitualTimer();

  setTimerItemCompleted(item, false);

  timerItem = item;
  timerTarget = Date.now() + minutes * 60 * 1000;
  const overlay = document.querySelector("[data-timer-overlay]");
  overlay.hidden = false;
  overlay.classList.remove("alarming");
  document.querySelector("[data-timer-hint]").textContent = "Timer running";
  document.querySelector("[data-timer-controls]").hidden = false;
  updateRitualTimer();
  timerInterval = window.setInterval(updateRitualTimer, 250);
  acquireTimerWakeLock();
}

function acknowledgeRitualTimer() {
  const completedItem = timerItem;
  cancelRitualTimer();
  if (!completedItem) return;
  setTimerItemCompleted(completedItem, true);
  completedItem.scrollIntoView({ behavior: "smooth", block: "center" });
}

function adjustRitualTimer(minutes) {
  const overlay = document.querySelector("[data-timer-overlay]");
  if (!timerTarget || overlay.classList.contains("alarming")) return;
  timerTarget += minutes * 60 * 1000;
  updateRitualTimer();
}

function renderNodes(nodes) {
  const list = document.createElement("ul");
  list.className = "ritual-list";

  nodes.forEach((node) => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    const label = document.createElement("span");
    const hasChildren = node.children.length > 0;
    const link = chapterLink(node.text);
    const timerMatch = node.text.match(/^(.*?)\s*\|__\|\s*(minutes.*)$/i);
    let timerInput = null;

    item.className = "ritual-item";
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
      input.value = String(storedTimerMinutes());
      input.inputMode = "numeric";
      input.setAttribute("aria-label", "Daimoku minutes");
      input.addEventListener("change", () => {
        const value = Math.min(180, Math.max(1, Math.round(Number(input.value) || 5)));
        input.value = String(value);
        storeTimerMinutes(value);
      });
      suffix.textContent = "min";
      timerInput = input;
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

    if (node.marker === "*" && timerMatch) {
      const hourglass = document.createElement("button");
      hourglass.type = "button";
      hourglass.className = "ritual-timer-check";
      hourglass.textContent = "⏳";
      hourglass.setAttribute("aria-label", "Start Daimoku timer");
      hourglass.addEventListener("click", () => startRitualTimer(Number(timerInput.value), item));
      row.append(hourglass);
    } else if (node.marker === "*") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "ritual-check";
      checkbox.setAttribute("aria-label", `Complete ${node.text}`);
      checkbox.addEventListener("change", () => {
        item.classList.toggle("completed", checkbox.checked);
        if (!hasChildren) return;
        const toggle = row.querySelector(".ritual-toggle");
        item.classList.toggle("collapsed", checkbox.checked);
        toggle.disabled = checkbox.checked;
        toggle.textContent = checkbox.checked ? "+" : "−";
        toggle.setAttribute("aria-expanded", String(!checkbox.checked));
      });
      row.append(checkbox);
    }

    row.append(label);
    item.append(row);
    if (hasChildren) item.append(renderNodes(node.children));
    list.append(item);
  });

  return list;
}

async function loadRitual() {
  const response = await fetch("assets/ritual.txt");
  if (!response.ok) throw new Error(`Could not load ritual: ${response.status}`);

  const { nodes, notes } = parseRitual(await response.text());
  document.querySelector("[data-ritual-tree]").replaceChildren(renderNodes(nodes));
  document.querySelector("[data-ritual-notes]").replaceChildren(...notes.map(renderNote));
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

document.querySelector("[data-timer-back]").addEventListener("click", (event) => {
  event.stopPropagation();
  cancelRitualTimer();
});

document.querySelector("[data-timer-minus]").addEventListener("click", (event) => {
  event.stopPropagation();
  adjustRitualTimer(-1);
});

document.querySelector("[data-timer-plus]").addEventListener("click", (event) => {
  event.stopPropagation();
  adjustRitualTimer(1);
});

document.querySelector("[data-timer-overlay]").addEventListener("click", (event) => {
  if (event.currentTarget.classList.contains("alarming")) acknowledgeRitualTimer();
});
