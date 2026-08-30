import { initRitual, setRitualViewVisible } from "./ritual.js";
import { activeChapterNumber, initTrainer, pauseChapter } from "./syllables.js";

const hosts = {
  ritual: document.querySelector('[data-view-host="ritual"]'),
  trainer: document.querySelector('[data-view-host="trainer"]'),
};
let ritualRegistry;
let chapters;
let currentView;

function requestedView() {
  return new URL(location.href).searchParams.get("view") === "trainer" ? "trainer" : "ritual";
}

function targetHash(view, hash = location.hash) {
  if (view === "trainer") return hash.replace(/^#ritual-chapter-(2|16)$/, "#chapter-$1");
  return hash;
}

function placeChapters(view) {
  chapters.forEach((chapter, number) => {
    const destination = view === "ritual"
      ? ritualRegistry.chapterSlots.get(number)
      : hosts.trainer.querySelector(`[data-chapter-deck="${number}"]`);
    destination.append(chapter);
    chapter.querySelector(".ritual-back-link").hidden = view === "ritual";
  });
}

function revealRitualTarget(hash) {
  const match = hash.match(/^#(?:chapter|ritual-chapter)-(2|16)$/);
  if (!match) return;
  const item = ritualRegistry.chapterItems.get(match[1]);
  if (!item || !item.classList.contains("collapsed")) return;
  item.querySelector(":scope > .ritual-row .ritual-toggle")?.click();
}

function scrollToHash(view, hash) {
  if (!hash) return;
  if (view === "ritual") revealRitualTarget(hash);
  const target = view === "ritual" && /^#chapter-(2|16)$/.test(hash)
    ? hash.replace(/^#chapter-/, "#ritual-chapter-")
    : hash;
  let id;
  try {
    id = decodeURIComponent(target.slice(1));
  } catch {
    return;
  }
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
}

function renderView(view, hash = location.hash) {
  const activeChapter = view === "ritual" ? activeChapterNumber() : null;
  placeChapters(view);
  if (view === "ritual" && !/chapter-(2|16)$/.test(hash) && activeChapter) {
    revealRitualTarget(`#chapter-${activeChapter}`);
  }
  Object.entries(hosts).forEach(([name, host]) => { host.hidden = name !== view; });
  setRitualViewVisible(view === "ritual");
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    const active = link.dataset.viewLink === view;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  currentView = view;
  scrollToHash(view, hash);
}

function navigate(view, hash = "", replace = false) {
  const url = new URL(location.href);
  url.search = `?view=${view}`;
  url.hash = targetHash(view, hash);
  history[replace ? "replaceState" : "pushState"]({ view }, "", url);
  renderView(view, url.hash);
}

function setupRouting() {
  document.addEventListener("click", (event) => {
    const viewLink = event.target.closest("[data-view-link]");
    const appLink = event.target.closest('a[href^="?view="]');
    const link = viewLink || appLink;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(link.href, location.href);
    const hash = viewLink ? location.hash : url.hash;
    navigate(url.searchParams.get("view") === "trainer" ? "trainer" : "ritual", hash);
  });
  window.addEventListener("popstate", () => renderView(requestedView(), location.hash));
  window.addEventListener("hashchange", () => {
    if (requestedView() === currentView) scrollToHash(currentView, location.hash);
  });
}

function setupInstallPrompt() {
  const button = document.querySelector("[data-install-button]");
  const message = document.querySelector("[data-install-message]");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let promptEvent = null;

  if (standalone) message.textContent = "Installed. This app is available offline after its first successful load.";
  else if (ios) message.textContent = "To install on iPhone: Share -> Add to Home Screen. Offline works after one complete online load.";

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    button.hidden = false;
    message.textContent = "Install this app for quick access and offline reading.";
  });
  button.addEventListener("click", async () => {
    if (!promptEvent) return;
    button.hidden = true;
    promptEvent.prompt();
    await promptEvent.userChoice;
    promptEvent = null;
  });
  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    message.textContent = "Installed. Offline reading is enabled.";
  });
}

function registerServiceWorker() {
  const message = document.querySelector("[data-install-message]");
  if (!("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    setTimeout(() => location.reload(), 1000);
  });
  navigator.serviceWorker.register("sw.js").then((registration) => {
    registration.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
    if (!matchMedia("(display-mode: standalone)").matches && !/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      message.textContent = registration.active
        ? "Offline cache is active. Install is available from your browser menu if no button appears."
        : "Preparing offline cache. Install is available from your browser menu if no button appears.";
    }
  }).catch(() => { message.textContent = "Install may still work, but offline caching is unavailable."; });
}

async function init() {
  const trainerHost = document.querySelector("[data-chapters]");
  trainerHost.replaceChildren(...["2", "16"].map((number) => {
    const deck = document.createElement("div");
    deck.dataset.chapterDeck = number;
    return deck;
  }));
  [ritualRegistry, chapters] = await Promise.all([
    initRitual({ onChapterCollapse: pauseChapter }),
    initTrainer(),
  ]);
  setupRouting();
  setupInstallPrompt();
  registerServiceWorker();
  const view = requestedView();
  const canonicalHash = targetHash(view);
  if (canonicalHash !== location.hash || !new URL(location.href).searchParams.has("view")) {
    navigate(view, canonicalHash, true);
  } else {
    renderView(view, canonicalHash);
  }
}

init().catch((error) => {
  document.querySelector("main").textContent = error.message;
});
