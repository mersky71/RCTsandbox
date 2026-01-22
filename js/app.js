// app.js
import {
  loadActiveChallenge,
  saveActiveChallenge,
  clearActiveChallenge,
  startNewChallenge,
  isActiveChallengeForNow,
  // NEW:
  archiveChallengeToHistory,
  loadChallengeHistory,
  setChallengeSaved,
  deleteChallengeFromHistory,
  getMostRecentHistoryChallenge,
  popMostRecentHistoryChallenge,
  getChallengeLastActivityISO,
  hoursSinceISO
} from "./storage.js";

const RESUME_WINDOW_HOURS = 36;

const PARKS = [
  { id: "mk", name: "Magic Kingdom" },
  { id: "ep", name: "EPCOT" },
  { id: "hs", name: "Hollywood Studios" },
  { id: "ak", name: "Animal Kingdom" }
];

// Park colors (CSS uses --park)
const PARK_THEME = {
  // Home/start page theme
  home: { park: "#7c3aed", park2: "rgba(124,58,237,.12)", parkText: "#0b0f14" }, // Purple

  // Park themes
  mk: { park: "#22d3ee", park2: "rgba(34,211,238,.26)", parkText: "#0b0f14" }, // Cyan
  hs: { park: "#ff3ea5", park2: "rgba(255,62,165,.26)", parkText: "#0b0f14" }, // Magenta
  ep: { park: "#fb923c", park2: "rgba(251,146,60,.26)", parkText: "#0b0f14" }, // Orange
  ak: { park: "#166534", park2: "rgba(22,101,52,.26)", parkText: "#0b0f14" }  // Forest green
};

const appEl = document.getElementById("app");
const parkSelect = document.getElementById("parkSelect");
const counterPill = document.getElementById("counterPill");
const dialogHost = document.getElementById("dialogHost");

const moreBtn = document.getElementById("moreBtn");
const moreMenu = document.getElementById("moreMenu");
const endToStartBtn = document.getElementById("endToStartBtn");
const appTitle = document.getElementById("appTitle");

let rides = [];
let ridesById = new Map();
let active = null;
let currentPark = "mk";

// Draft excluded rides (chosen on Start page before a run begins)
const KEY_EXCLUDED_DRAFT = "erw_excludedDraft_v1";

function loadExcludedDraftIds() {
  try {
    const raw = localStorage.getItem(KEY_EXCLUDED_DRAFT);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveExcludedDraftIds(ids) {
  localStorage.setItem(KEY_EXCLUDED_DRAFT, JSON.stringify(ids));
}

function clearExcludedDraftIds() {
  localStorage.removeItem(KEY_EXCLUDED_DRAFT);
}

init();

async function init() {
  setupParksDropdown();
  setupMoreMenu();
  setupAutoScrollToTopOnReturnIfParkComplete();

  rides = await fetch("./data/rides.json").then(r => r.json());
  rides = rides.filter(r => r.active !== false);

  ridesById = new Map(rides.map(r => [r.id, r]));

  active = loadActiveChallenge();

  if (active && !isActiveChallengeForNow(active)) {
    // If yesterday's run wasn't ended manually, move it to Recent automatically
    if (active?.events?.length > 0) {
      archiveChallengeToHistory({ ...active, endedAt: new Date().toISOString() }, { saved: false });
    }

    clearActiveChallenge();
    active = null;

    renderStartPage();
    setHeaderEnabled(false);
    applyParkTheme("home");
    return;
  }

  if (active) {
    setHeaderEnabled(true);
    currentPark = "mk";
    parkSelect.value = currentPark;
    applyParkTheme(currentPark);
    renderParkPage({ readOnly: false });
  } else {
    renderStartPage();
    setHeaderEnabled(false);
    applyParkTheme("home");
  }
}

function setupParksDropdown() {
  parkSelect.innerHTML = "";
  for (const p of PARKS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    parkSelect.appendChild(opt);
  }
  parkSelect.addEventListener("change", () => {
    currentPark = parkSelect.value;
    applyParkTheme(currentPark);
    if (active) renderParkPage({ readOnly: false });
  });
}

function getExcludedSetForActive() {
  const ids = active?.excludedRideIds || active?.settings?.excludedRideIds || [];
  return new Set(Array.isArray(ids) ? ids : []);
}

function setupAutoScrollToTopOnReturnIfParkComplete() {
  const maybeScrollToTop = () => {
    if (!active) return;
    if (!isParkCompleteNow(currentPark)) return;
    if (window.scrollY < 40) return; // don't jump if already near the top

    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeScrollToTop();
  });

  window.addEventListener("focus", () => {
    maybeScrollToTop();
  });
}


function setupMoreMenu() {
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const expanded = moreBtn.getAttribute("aria-expanded") === "true";
    moreBtn.setAttribute("aria-expanded", String(!expanded));
    moreMenu.setAttribute("aria-hidden", String(expanded));
  });

  document.addEventListener("click", () => {
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");
  });

  // Ensure "Excluded rides" exists in More menu (insert in correct order)
  // Order (top->bottom): Share update, Tweet text, Excluded rides, Saved challenges, End challenge
  ensureMoreMenuExcludedRidesItem();

  // Saved Challenges
  const savedChallengesMenuBtn = document.getElementById("savedChallengesMenuBtn");
  savedChallengesMenuBtn?.addEventListener("click", () => {
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");
    openSavedChallengesDialog();
  });

  // Settings
  const settingsMenuBtn = document.getElementById("settingsMenuBtn");
  settingsMenuBtn?.addEventListener("click", () => {
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");

    if (!active) {
      showToast("Start a challenge first.");
      return;
    }

    const currentTags =
      (active.tagsText ?? active.settings?.tagsText ?? "").trim();
    const currentLink =
      (active.fundraisingLink ?? active.settings?.fundraisingLink ?? "").trim();

    openDialog({
      title: "Settings",
      body: "Update these any time (this does not restart your challenge).",
      content: `
        <div class="formRow">
          <div class="label">Tags and hashtags</div>
          <textarea id="settingsTags" class="textarea" style="min-height:100px;">${escapeHtml(currentTags)}</textarea>
        </div>
        <div class="formRow" style="margin-top:10px;">
          <div class="label">My fundraising link</div>
          <input id="settingsLink" class="input" value="${escapeHtml(currentLink)}" placeholder="https://..." />
        </div>
      `,
      buttons: [
        {
          text: "Save",
          className: "btn btnPrimary",
          action: () => {
            const newTags =
              (document.getElementById("settingsTags")?.value ?? "").trim();
            const newLink =
              (document.getElementById("settingsLink")?.value ?? "").trim();

            // Store in both places so nothing disappears later
            active.tagsText = newTags;
            active.fundraisingLink = newLink;
            active.settings = active.settings || {};
            active.settings.tagsText = newTags;
            active.settings.fundraisingLink = newLink;

            saveActiveChallenge(active);
            closeDialog();
            showToast("Settings saved.");
          }
        },
        { text: "Cancel", className: "btn", action: () => closeDialog() }
      ]
    });
  });

  // Excluded rides (mid-run)
  const excludedRidesMenuBtn = document.getElementById("excludedRidesMenuBtn");
  excludedRidesMenuBtn?.addEventListener("click", () => {
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");

    if (!active) {
      showToast("Start a challenge first.");
      return;
    }

    openExcludedRidesDialog({
      excludedIds: getExcludedSetForActive(),
      parkFilter: new Set([currentPark]),
      persistMode: "active"
    });
  });

  // Tweet update (image) in More menu
  const tweetUpdateMenuBtn = document.getElementById("tweetUpdateMenuBtn");
  tweetUpdateMenuBtn?.addEventListener("click", async () => {
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");

    if (!active || !active.events || active.events.length === 0) {
      showToast("Log at least one ride first.");
      return;
    }

    try {
      const { blob, headerText } = await renderUpdateImagePng(active);
      showUpdateImageDialog({ blob, headerText });
    } catch (e) {
      console.error(e);
      showToast("Sorry — could not create the image on this device.");
    }
  });

  // End challenge (auto-save into history as "Recent")
  endToStartBtn.addEventListener("click", () => {
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");

    openConfirmDialog({
      title: "End today’s challenge?",
      body: "This will save today into Recent history, clear all rides logged today, and return you to the Start page. You can begin a new challenge immediately.",
      confirmText: "End challenge and return to Start",
      confirmClass: "btnDanger",
      onConfirm: () => {
        if (active && active.events && active.events.length > 0) {
          // Save into history as recent (not permanently “Saved” yet)
          archiveChallengeToHistory({ ...active, endedAt: new Date().toISOString() }, { saved: false });
        }

        clearActiveChallenge();
        active = null;

        setHeaderEnabled(false);
        applyParkTheme("home");
        renderStartPage();
      }
    });
  });
}

function ensureMoreMenuExcludedRidesItem() {
  if (!moreMenu) return;

  // If already present in HTML, just ensure ordering is correct.
  let btn = document.getElementById("excludedRidesMenuBtn");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "excludedRidesMenuBtn";
    btn.className = "menu__item";
    btn.type = "button";
    btn.textContent = "Excluded rides";
  }

  // Insert between settings and saved challenges
  const settingsBtn = document.getElementById("settingsMenuBtn");
  const savedBtn = document.getElementById("savedChallengesMenuBtn");

  // If it’s already in the right place, do nothing
  const isChild = btn.parentElement === moreMenu;
  if (isChild) {
    // If it's already immediately before savedBtn, great.
    if (savedBtn && btn.nextElementSibling === savedBtn) return;
    // Otherwise remove so we can reinsert correctly.
    try { moreMenu.removeChild(btn); } catch {}
  }

  // Prefer inserting after settings button; fallback: before saved; fallback: append before endToStart
  if (settingsBtn && settingsBtn.parentElement === moreMenu) {
    if (settingsBtn.nextElementSibling) {
      moreMenu.insertBefore(btn, settingsBtn.nextElementSibling);
    } else {
      moreMenu.appendChild(btn);
    }
    // If saved button exists and is now immediately after, we're good; otherwise, try to place before saved.
    if (savedBtn && btn.nextElementSibling !== savedBtn) {
      try { moreMenu.insertBefore(btn, savedBtn); } catch {}
    }
    return;
  }

  if (savedBtn && savedBtn.parentElement === moreMenu) {
    moreMenu.insertBefore(btn, savedBtn);
    return;
  }

  const endBtn = document.getElementById("endToStartBtn");
  if (endBtn && endBtn.parentElement === moreMenu) {
    moreMenu.insertBefore(btn, endBtn);
    return;
  }

  moreMenu.appendChild(btn);
}

function setHeaderEnabled(enabled) {
  // Hide app title on park pages
  if (appTitle) appTitle.style.display = enabled ? "none" : "block";

  // Show/hide controls
  parkSelect.style.display = enabled ? "inline-flex" : "none";
  moreBtn.style.display = enabled ? "inline-flex" : "none";
  counterPill.style.display = enabled ? "inline-flex" : "none";

  // Enable/disable
  parkSelect.disabled = !enabled;
  moreBtn.disabled = !enabled;
}

function applyParkTheme(parkId) {
  const t = PARK_THEME[parkId] || PARK_THEME.mk;
  document.documentElement.style.setProperty("--park", t.park);
  document.documentElement.style.setProperty("--park2", t.park2);
  document.documentElement.style.setProperty("--parkText", t.parkText);
}



function getResumeCandidate() {
  const mostRecent = getMostRecentHistoryChallenge();
  if (!mostRecent) return null;

  const lastISO = getChallengeLastActivityISO(mostRecent);
  const hoursAgo = hoursSinceISO(lastISO);

  if (!(hoursAgo <= RESUME_WINDOW_HOURS)) return null;

  const ridesCount = Array.isArray(mostRecent.events) ? mostRecent.events.length : 0;
  if (ridesCount <= 0) return null;

  const lastDate = lastISO ? new Date(lastISO) : null;
  const lastActivityLabel = lastDate ? `${formatDateShort(lastDate)} at ${formatTime(lastDate)}` : "Unknown";

  return { challenge: mostRecent, lastISO, hoursAgo, ridesCount, lastActivityLabel };
}

function handleResumeMostRecent() {
  const ch = popMostRecentHistoryChallenge();
  if (!ch) {
    showToast("No recent run available to resume.");
    return;
  }

  // Re-open: clear “ended” / “saved” markers so it behaves like an active run.
  delete ch.endedAt;
  delete ch.saved;
  delete ch.savedAt;

  // Ensure required fields exist
  ch.events = Array.isArray(ch.events) ? ch.events : [];
  ch.settings = ch.settings || {};

  active = ch;
  saveActiveChallenge(active);

  render();
}
function renderStartPage() {
  const resumeCandidate = getResumeCandidate();
  const resumeCardHtml = resumeCandidate ? `
      <div class="card">
        <div class="h1">Resume most recent run</div>
        <p class="p" style="margin-top:6px;">
          Last activity: ${escapeHtml(resumeCandidate.lastActivityLabel)} · ${resumeCandidate.ridesCount} ride${resumeCandidate.ridesCount === 1 ? "" : "s"}
        </p>
        <div class="btnRow" style="margin-top:12px;">
          <button id="resumeMostRecentBtn" class="btn btnPrimary" type="button">Resume</button>
        </div>
      </div>
  ` : "";

  appEl.innerHTML = `
    <div class="stack startPage">
      <div class="card">
        <div class="h1">Welcome</div>
        <p class="p">
          This experimental app helps track rides and generate draft tweets for an Every Ride Challenge.
        </p>
        <p class="p" style="margin-top:10px;">
          There may be bugs -- if it breaks down, please be prepared to compose ride tweets manually!
        </p>
      </div>

      ${resumeCardHtml}

      <div class="card">
        <div class="h1">Start a new challenge</div>

        <div class="formRow">
          <div class="label">Tags and hashtags (modify as needed)</div>
          <textarea id="tagsText" class="textarea" style="min-height:80px;">#EveryRideWDW @RideEvery
  
Help me support @GKTWVillage by donating at the link below</textarea>
        </div>

        <div class="formRow" style="margin-top:12px;">
          <div class="label">My fundraising link (modify as needed)</div>
          <input id="fundLink" class="input" placeholder="https://..." />
        </div>

        <div class="card" style="margin-top:12px; border: 1px solid rgba(17,24,39,0.12);">
          <div class="h1" style="font-size:16px;">Exclude rides (refurb / custom challenge)</div>
           <p class="p" style="margin-top:6px;"> Click to exclude rides that are not operating today, or to create a custom challenge. </p>
          <div class="btnRow" style="margin-top:10px;">
            <button id="excludedRidesBtn" class="btn btnPrimary" type="button">Rides excluded: 0 of 0</button>
          </div>
        </div>

        <div class="btnRow" style="margin-top:12px;">
          <button id="startBtn" class="btn btnPrimary" type="button">Start new challenge</button>
          <button id="viewSavedBtn" class="btn btnPrimary" type="button">Previous challenges</button>
        </div>
      </div>
    </div>
  `;

  // Update excluded counts on Start page
  const draftExcluded = new Set(loadExcludedDraftIds());
  const excludedBtn = document.getElementById("excludedRidesBtn");
  if (excludedBtn) {
    excludedBtn.textContent = `Rides excluded: ${draftExcluded.size} of ${rides.length}`;
  }

  // Open Excluded Rides dialog (default filter: MK checked)
  document.getElementById("excludedRidesBtn")?.addEventListener("click", () => {
    openExcludedRidesDialog({
      excludedIds: new Set(loadExcludedDraftIds()),
      parkFilter: new Set(["mk"]),
      persistMode: "draft"
    });
  });

  // Resume most recent run (from Saved or Recent history)
  document.getElementById("resumeMostRecentBtn")?.addEventListener("click", () => {
    const candidate = getResumeCandidate();
    if (!candidate) return;

    openConfirmDialog({
      title: "Resume most recent run?",
      body:
        `Last activity: ${candidate.lastActivityLabel}\n` +
        `${candidate.ridesCount} ride${candidate.ridesCount === 1 ? "" : "s"} logged\n\n` +
        "Resuming will remove this run from Previous challenges and continue it.",
      confirmText: "Resume run",
      confirmClass: "",
      onConfirm: () => handleResumeMostRecent()
    });
  });


  document.getElementById("startBtn")?.addEventListener("click", () => {
    const tagsText = document.getElementById("tagsText").value ?? "";
    const fundraisingLink = document.getElementById("fundLink").value ?? "";

    active = startNewChallenge({ tagsText, fundraisingLink });

    // Copy “excluded rides” draft into the new active challenge
    const excludedIds = loadExcludedDraftIds();
    active.excludedRideIds = excludedIds;
    active.settings = active.settings || {};
    active.settings.excludedRideIds = excludedIds;

    // Clear draft once the run starts (tomorrow starts fresh)
    clearExcludedDraftIds();

    // Make sure tweet builder can read these no matter where storage keeps them.
    active.tagsText = tagsText;
    active.fundraisingLink = fundraisingLink;
    saveActiveChallenge(active);

    setHeaderEnabled(true);
    currentPark = "mk";
    parkSelect.value = currentPark;
    applyParkTheme(currentPark);
    renderParkPage({ readOnly: false });
  });

  document.getElementById("viewSavedBtn")?.addEventListener("click", () => {
    openSavedChallengesDialog();
  });
}

function openExcludedRidesDialog({ excludedIds, parkFilter, persistMode = "draft" }) {
  if (!parkFilter || parkFilter.size === 0) parkFilter = new Set(["mk"]);

  const sortBySortKey = (a, b) =>
    (a.sortKey || "").localeCompare(b.sortKey || "", "en", { sensitivity: "base" });

  function rideLabel(r) {
    return r.mediumName || r.name || r.shortName || "";
  }

  function renderPickRow(r, isExcluded) {
    return `
      <div data-pick="${r.id}"
           style="display:flex;align-items:center;gap:10px;padding:8px 6px;cursor:pointer;">
        <input type="checkbox" data-pickcb="${r.id}" ${isExcluded ? "checked" : ""}
               style="transform: scale(1.1);" />
        <div style="flex:1;min-width:0;font-weight:600;font-size:14px;">
          ${escapeHtml(rideLabel(r))}
        </div>
      </div>
    `;
  }

  function renderParkFilters() {
    const chip = (label, checked, parkId) => `
      <label style="display:inline-flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid #e5e7eb;border-radius:999px;background:#ffffff;font-weight:800;">
        <input type="radio" name="parkPick" data-park="${parkId}" ${checked ? "checked" : ""} />
        <span>${label}</span>
      </label>
    `;

    // Exclusive selection: pick the first value if set, otherwise default to mk
    const selected = parkFilter && parkFilter.size ? [...parkFilter][0] : "mk";

    return `
      <div class="formRow">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          ${chip("MK", selected === "mk", "mk")}
          ${chip("EP", selected === "ep", "ep")}
          ${chip("HS", selected === "hs", "hs")}
          ${chip("AK", selected === "ak", "ak")}
        </div>
      </div>
    `;
  }

  function renderContent() {
    const excludedRides = rides.filter(r => excludedIds.has(r.id)).sort(sortBySortKey);

    const includedRides =
      parkFilter.size === 0
        ? []
        : rides
            .filter(r => !excludedIds.has(r.id))
            .
