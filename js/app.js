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
  deleteChallengeFromHistory
} from "./storage.js";

const RESORTS = {
  wdw: {
    id: "wdw",
    name: "Walt Disney World",
    parks: [
      { id: "mk", name: "Magic Kingdom" },
      { id: "ep", name: "EPCOT" },
      { id: "hs", name: "Hollywood Studios" },
      { id: "ak", name: "Animal Kingdom" }
    ],
    startDefaults: {
      tagsText: `#EveryRideWDW @RideEvery

Help me support @GKTWVillage by donating at the link below`
    }
  },
  dlr: {
    id: "dlr",
    name: "Disneyland Resort",
    parks: [
      { id: "dl", name: "Disneyland Park" },
      { id: "dca", name: "California Adventure" }
    ],
    startDefaults: {
      tagsText: `#EveryRideDLR @RideEvery

Help me support @GKTWVillage by donating at the link below`
    }
  }
};

const POINTS_DEFAULT_TAGS = `#EveryRidePoints @RideEvery

Help me support @GKTWVillage by donating at the link below`;
const POINTS_PARK_BONUSES = { mk: 100, ep: 75, hs: 75, ak: 50 };
const PARK_ABBREVIATIONS = { mk: "MK", ep: "EP", hs: "HS", ak: "AK" };
const POINTS_OPTIONAL_RIDE_IDS = new Set(["mk_main_street_vehicles"]);

function getResort(resortId) {
  return RESORTS[resortId] || RESORTS.wdw;
}

function getParksForResort(resortId) {
  return getResort(resortId).parks;
}

// Park colors (CSS uses --park)
const PARK_THEME = {
  // Home/start page theme (main landing page)
  home: { park: "#7c3aed", park2: "rgba(124,58,237,.12)", parkText: "#0b0f14" }, // Purple

  // Resort landing page themes
  wdwHome: { park: "#4E7FA8", park2: "rgba(78,127,168,.22)", parkText: "#0b0f14" }, // Slate blue
  dlrHome: { park: "#C98A9A", park2: "rgba(201,138,154,.22)", parkText: "#0b0f14" }, // Muted pink

  // Park themes
  mk: { park: "#22d3ee", park2: "rgba(34,211,238,.26)", parkText: "#0b0f14" }, // Cyan
  hs: { park: "#ff3ea5", park2: "rgba(255,62,165,.26)", parkText: "#0b0f14" }, // Magenta
  ep: { park: "#fb923c", park2: "rgba(251,146,60,.26)", parkText: "#0b0f14" }, // Orange
  ak: { park: "#166534", park2: "rgba(22,101,52,.26)", parkText: "#0b0f14" },  // Forest green

  // Disneyland Resort park themes
  dl: { park: "#ef4444", park2: "rgba(239,68,68,.22)", parkText: "#0b0f14" },   // Red
  dca: { park: "#2563eb", park2: "rgba(37,99,235,.22)", parkText: "#0b0f14" }  // Blue
};



const appEl = document.getElementById("app");
const parkSelect = document.getElementById("parkSelect");
const counterPill = document.getElementById("counterPill");
const pointsPill = document.getElementById("pointsPill");
const pointsParkPicker = document.getElementById("pointsParkPicker");
const pointsParkMenu = document.getElementById("pointsParkMenu");
const dialogHost = document.getElementById("dialogHost");

const moreBtn = document.getElementById("moreBtn");
const moreMenu = document.getElementById("moreMenu");
const endToStartBtn = document.getElementById("endToStartBtn");
const appTitle = document.getElementById("appTitle");

let allRides = [];
let rides = []; // active rides for current resort (active !== false)
let ridesById = new Map(); // ALL rides by id (includes inactive + all resorts)
let active = null;
let currentResort = null;
let currentChallengeMode = "standard";
let currentPark = "mk";

// Live posted wait times (ThemeParks.wiki)
const THEMEPARKS_WIKI_PARK_IDS = {
  mk: "75ea578a-adc8-4116-a54d-dccb60765ef9",
  ep: "47f90d2c-e191-4239-a466-5892ef59a88b",
  hs: "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
  ak: "1c84a229-8862-4648-9c71-378ddd2c7693",
  dl: "7340550b-c14d-4def-80bb-acdb51d49a66",
  dca: "832fcd51-ea19-4e77-85c7-75d5843b127c"
};

const WAIT_ENTITY_ALIASES = {
  hs_rnrc: [
    "Rock 'n' Roller Coaster Starring The Muppets",
    "Rock ’n’ Roller Coaster Starring The Muppets",
    "Rock 'n' Roller Coaster"
  ],
  ak_ee: [
    "Expedition Everest - Legend of the Forbidden Mountain",
    "Expedition Everest – Legend of the Forbidden Mountain",
    "Expedition Everest"
  ],
  ep_soarin: [
    "Soarin' Across America",
    "Soarin’ Across America",
    "Soarin' Around the World",
    "Soarin’ Around the World"
  ],
  dlr_chip_n_dales_go_coaster: [
    "Chip 'n' Dale's GADGETcoaster",
    "Chip ’n’ Dale’s GADGETcoaster",
    "Chip 'n' Dale's Go Coaster",
    "Gadget's Go Coaster"
  ],
  dlr_haunted_mansion: [
    "Haunted Mansion Holiday",
    "Haunted Mansion"
  ],
  dlr_the_incredicoaster: [
    "Incredicoaster",
    "The Incredicoaster"
  ],
  dlr_luigis_rollickin_roadsters: [
    "Luigi's Rollickin' Roadsters",
    "Luigi’s Rollickin’ Roadsters",
    "Luigi's Rollickin Roadsters",
    "Luigi's Honkin' Haul-O-Ween",
    "Luigi’s Honkin’ Haul-O-Ween"
  ],
  dlr_maters_junkyard_jamboree: [
    "Mater's Junkyard Jamboree",
    "Mater’s Junkyard Jamboree",
    "Mater's Graveyard JamBOOree",
    "Mater’s Graveyard JamBOOree"
  ],
  dlr_pixar_pal_a_round: [
    "Pixar Pal-A-Round",
    "Pixar Pal-A-Round - Swinging",
    "Pixar Pal-A-Round – Swinging",
    "Pixar Pal-A-Round - Non-Swinging",
    "Pixar Pal-A-Round – Non-Swinging"
  ],
  dlr_soarin_around_the_world: [
    "Soarin' Across America",
    "Soarin’ Across America",
    "Soarin' Around the World",
    "Soarin’ Around the World",
    "Soarin' Over California",
    "Soarin’ Over California"
  ]
};

const WAIT_TIMES_REFRESH_MS = 5 * 60 * 1000;
const waitTimesCache = new Map();
const waitTimesRequests = new Map();

// Remember the selected park across a browser refresh without making it a long-term preference.
function selectedParkSessionKey(resortId, challengeMode = currentChallengeMode) {
  return `erw_selectedPark_${resortId || "wdw"}_${challengeMode || "standard"}_v1`;
}

function rememberSelectedPark(parkId, resortId = currentResort) {
  try {
    sessionStorage.setItem(selectedParkSessionKey(resortId, currentChallengeMode), parkId);
  } catch {}
}

function loadRememberedPark(resortId = currentResort) {
  try {
    const parkId = sessionStorage.getItem(selectedParkSessionKey(resortId, currentChallengeMode));
    return getParksForResort(resortId || "wdw").some(p => p.id === parkId) ? parkId : null;
  } catch {
    return null;
  }
}


// Draft excluded rides (chosen on Start page before a run begins)
// Stored per resort so DLR/WDW drafts don't collide (even if users rarely switch).
function excludedDraftKey(resortId, challengeMode = currentChallengeMode) {
  const rid = resortId || "wdw";
  return `erw_excludedDraft_${rid}_${challengeMode || "standard"}_v1`;
}

function loadExcludedDraftIds(resortId = currentResort) {
  try {
    const raw = localStorage.getItem(excludedDraftKey(resortId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveExcludedDraftIds(ids, resortId = currentResort) {
  localStorage.setItem(excludedDraftKey(resortId), JSON.stringify(ids));
}

function clearExcludedDraftIds(resortId = currentResort) {
  localStorage.removeItem(excludedDraftKey(resortId));
}

init();

// Refresh live waits periodically while the user remains on a supported park page.
setInterval(() => {
  if (active && THEMEPARKS_WIKI_PARK_IDS[currentPark]) {
    loadWaitTimesForPark(currentPark, { force: true });
  }
}, WAIT_TIMES_REFRESH_MS);

async function init() {
  setupMoreMenu();
  setupAutoScrollToTopOnReturnIfParkComplete();

  allRides = await fetch("./data/rides.json").then(r => r.json());
  // Map includes ALL rides (inactive + all resorts) so historical runs still render correctly
  ridesById = new Map(allRides.map(r => [r.id, r]));

  active = loadActiveChallenge();

  if (active && !isActiveChallengeForNow(active)) {
    // If yesterday's run wasn't ended manually, move it to Recent automatically
    if (active?.events?.length > 0) {
      const resortId = active.resortId || "wdw";
      archiveChallengeToHistory({ ...active, resortId, endedAt: new Date().toISOString() }, { saved: false });
    }

    clearActiveChallenge();
    active = null;
  }

  if (active) {
    currentResort = active.resortId || "wdw";
    currentChallengeMode = active.challengeMode || "standard";
    // Back-compat: persist resortId on older stored challenges
    if (!active.resortId) {
      active.resortId = currentResort;
      saveActiveChallenge(active);
    }

    setRidesForResort(currentResort);
    setupParksDropdown();
    setupPointsParkPicker();

    setHeaderEnabled(true);
    currentPark = loadRememberedPark(currentResort) || getParksForResort(currentResort)[0]?.id || "mk";
    parkSelect.value = currentPark;
    updatePointsParkPickerLabel();
    applyParkTheme(currentPark);
    renderParkPage({ readOnly: false });
  } else {
    renderResortSelectPage();
    setHeaderEnabled(false);
    applyParkTheme("home");
  }
}

function setRidesForResort(resortId) {
  currentResort = resortId || "wdw";
  rides = allRides.filter(r => {
    if ((r.resort || "wdw") !== currentResort || r.active === false) return false;
    if (currentResort === "wdw" && currentChallengeMode !== "points" && r.id === "mk_main_street_vehicles") return false;
    return true;
  });
}

function renderResortSelectPage() {
  applyParkTheme("home");
  setHeaderEnabled(false);
  appEl.innerHTML = `
    <div class="stack startPage">
      <div class="card">
        <div class="h1">Welcome</div>
        <p class="p">
          This app may help you track your Every Ride Challenge run and generate draft tweets for you.
        </p>
      </div>

      <div class="card">
        <div class="h1">Choose your resort and challenge</div>
        <p class="p">Select the resort and challenge for today.</p>
        <div class="btnRow" style="margin-top:12px; gap:10px; flex-wrap:wrap;">
          <button id="chooseWDW" class="btn btnPrimary" type="button">Walt Disney World</button>
          <button id="chooseDLR" class="btn btnPrimary" type="button">Disneyland Resort</button>
        </div>
        <div class="btnRow" style="margin-top:10px;">
          <button id="chooseWDWPoints" class="btn btnPrimary" type="button">WDW Points Challenge</button>
        </div>
      </div>

<div class="card">
        <div class="h1">Notes</div>
        <p class="p">
          For some users with older iPhones, this app did not work because the phone wouldn't store the ride data. Have a backup plan in case this happens to you!
        </p>
      </div>    
    
    </div>
  `;

  document.getElementById("chooseWDW")?.addEventListener("click", () => {
    navigateToResort("wdw", "standard");
  });

  document.getElementById("chooseDLR")?.addEventListener("click", () => {
    navigateToResort("dlr", "standard");
  });

  document.getElementById("chooseWDWPoints")?.addEventListener("click", () => {
    navigateToResort("wdw", "points");
  });
}

function setupParksDropdown() {
  parkSelect.innerHTML = "";

  const parks = getParksForResort(currentResort || "wdw");
  for (const p of parks) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    parkSelect.appendChild(opt);
  }

  parkSelect.onchange = () => {
    currentPark = parkSelect.value;
    rememberSelectedPark(currentPark);
    applyParkTheme(currentPark);
    if (active) renderParkPage({ readOnly: false });
  };
}

function setupPointsParkPicker() {
  if (!pointsParkPicker || !pointsParkMenu) return;

  pointsParkMenu.innerHTML = getParksForResort("wdw").map(p =>
    `<button type="button" class="pointsParkMenu__item" data-points-park="${p.id}">${escapeHtml(p.name)}</button>`
  ).join("");

  pointsParkPicker.onclick = (e) => {
    e.stopPropagation();
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");
    const open = pointsParkPicker.getAttribute("aria-expanded") === "true";
    pointsParkPicker.setAttribute("aria-expanded", String(!open));
    pointsParkMenu.setAttribute("aria-hidden", String(open));
  };

  pointsParkMenu.querySelectorAll("[data-points-park]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const parkId = btn.getAttribute("data-points-park");
      if (!parkId) return;
      currentPark = parkId;
      parkSelect.value = parkId;
      rememberSelectedPark(currentPark);
      updatePointsParkPickerLabel();
      pointsParkPicker.setAttribute("aria-expanded", "false");
      pointsParkMenu.setAttribute("aria-hidden", "true");
      applyParkTheme(currentPark);
      if (active) renderParkPage({ readOnly: false });
      if (isPointsMode()) requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    });
  });
}

function updatePointsParkPickerLabel() {
  if (!pointsParkPicker) return;
  pointsParkPicker.textContent = `${PARK_ABBREVIATIONS[currentPark] || currentPark.toUpperCase()} ▾`;
}

function isPointsMode(ch = active) {
  return (ch?.challengeMode || currentChallengeMode) === "points";
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
    pointsParkPicker?.setAttribute("aria-expanded", "false");
    pointsParkMenu?.setAttribute("aria-hidden", "true");
    const expanded = moreBtn.getAttribute("aria-expanded") === "true";
    moreBtn.setAttribute("aria-expanded", String(!expanded));
    moreMenu.setAttribute("aria-hidden", String(expanded));
  });

  document.addEventListener("click", () => {
    moreBtn.setAttribute("aria-expanded", "false");
    moreMenu.setAttribute("aria-hidden", "true");
    pointsParkPicker?.setAttribute("aria-expanded", "false");
    pointsParkMenu?.setAttribute("aria-hidden", "true");
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
    openEndChallengeDialog();
  });
}

function openEndChallengeDialog() {
  const pendingTwoferEvents = getPendingTwoferEvents();

  if (pendingTwoferEvents.length) {
    openDialog({
      title: "End today’s challenge?",
      body: "You have 1 ride that has not been included in a Twofer tweet yet. Send a final tweet before ending?",
      content: "",
      buttons: [
        {
          text: "Send final tweet",
          className: "btn btnPrimary",
          action: () => {
            openTweetDraft(buildRideBatchTweet(pendingTwoferEvents));
            closeDialog();
            endCurrentChallengeAndReturnToStart();
          }
        },
        {
          text: "End without tweeting",
          className: "btn btnDanger",
          action: () => {
            closeDialog();
            endCurrentChallengeAndReturnToStart();
          }
        },
        { text: "Cancel", className: "btn", action: () => closeDialog() }
      ]
    });
    return;
  }

  openConfirmDialog({
    title: "End today’s challenge?",
    body: "This will save today into Recent history, clear all rides logged today, and return you to the Start page. You can begin a new challenge immediately.",
    confirmText: "End challenge and return to Start",
    confirmClass: "btnDanger",
    onConfirm: () => {
      endCurrentChallengeAndReturnToStart();
    }
  });
}

function endCurrentChallengeAndReturnToStart() {
  if (active && active.events && active.events.length > 0) {
    // Save into history as recent (not permanently “Saved” yet)
    archiveChallengeToHistory({ ...active, resortId: active.resortId || currentResort || "wdw", endedAt: new Date().toISOString() }, { saved: false });
  }

  clearActiveChallenge();
  active = null;

  setHeaderEnabled(false);
  applyParkTheme("home");
  renderStartPage();
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

  const pointsMode = enabled && isPointsMode();

  // Show/hide controls. Points mode uses a compact custom park picker.
  parkSelect.style.display = enabled && !pointsMode ? "inline-flex" : "none";
  if (pointsParkPicker) pointsParkPicker.style.display = pointsMode ? "inline-flex" : "none";
  if (pointsPill) pointsPill.style.display = pointsMode ? "inline-flex" : "none";
  moreBtn.style.display = enabled ? "inline-flex" : "none";
  counterPill.style.display = enabled ? "inline-flex" : "none";

  // Standard mode keeps the mature Rides -> Park order. Points mode uses
  // compact Pts -> Rides -> Park so the selector sits next to More.
  if (pointsPill) pointsPill.style.order = pointsMode ? "1" : "2";
  counterPill.style.order = pointsMode ? "2" : "1";
  if (pointsParkPicker?.parentElement) pointsParkPicker.parentElement.style.order = pointsMode ? "3" : "3";
  parkSelect.style.order = "2";

  // Enable/disable
  parkSelect.disabled = !enabled;
  if (pointsParkPicker) pointsParkPicker.disabled = !enabled;
  moreBtn.disabled = !enabled;

  if (pointsMode) updatePointsParkPickerLabel();
}

/* ==========================
   Navigation (SPA history)
   ========================== */

function navigateToHome(replace = false) {
  if (replace) {
    history.replaceState({ page: "home" }, "");
  } else {
    history.pushState({ page: "home" }, "");
  }
  currentResort = null;
  currentChallengeMode = "standard";
  active = null;
  renderResortSelectPage();
}

function navigateToResort(resortId, challengeMode = "standard", replace = false) {
  currentChallengeMode = challengeMode || "standard";
  const st = { page: "resort", resortId, challengeMode: currentChallengeMode };
  if (replace) {
    history.replaceState(st, "");
  } else {
    history.pushState(st, "");
  }
  setRidesForResort(resortId);
  setupParksDropdown();
  setupPointsParkPicker();
  renderStartPage(resortId, currentChallengeMode);
}

// Handle browser back/forward
window.addEventListener("popstate", (e) => {
  const st = e.state;
  if (!st || st.page === "home") {
    renderResortSelectPage();
    return;
  }
  if (st.page === "resort") {
    navigateToResort(st.resortId || "wdw", st.challengeMode || "standard", true);
    return;
  }
});

/* ==========================
   Resume helpers
   ========================== */

function getMostRecentHistoryEntryForResort(resortId, challengeMode = currentChallengeMode) {
  const hist = loadChallengeHistory().filter(x =>
    (x.resortId || "wdw") === resortId &&
    (x.challengeMode || "standard") === (challengeMode || "standard")
  );
  if (!hist.length) return null;
  return hist.reduce((best, cur) => {
    const tb = Date.parse(best.endedAt || best.startedAt || "") || 0;
    const tc = Date.parse(cur.endedAt || cur.startedAt || "") || 0;
    return tc > tb ? cur : best;
  }, hist[0]);
}

function isWithinHours(historyEntry, hours) {
  const t = Date.parse(historyEntry.endedAt || historyEntry.startedAt || "") || 0;
  if (!t) return false;
  const ms = hours * 60 * 60 * 1000;
  return (Date.now() - t) <= ms;
}

// Match storage.js 3am cutoff behavior
function computeDayKeyNow() {
  const now = new Date();
  const cutoffHour = 3;
  const d = new Date(now);
  if (d.getHours() < cutoffHour) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resumeHistoryChallenge(historyEntry) {
  // Clone history into an active challenge
  const resumed = JSON.parse(JSON.stringify(historyEntry || {}));
  resumed.saved = false;
  delete resumed.endedAt;

  resumed.dayKey = computeDayKeyNow();
  resumed.resortId = resumed.resortId || currentResort || "wdw";
  resumed.challengeMode = resumed.challengeMode || currentChallengeMode || "standard";

  // Ensure settings exist
  resumed.settings = resumed.settings || {};
  resumed.tagsText = resumed.tagsText || resumed.settings.tagsText || "";
  resumed.fundraisingLink = resumed.fundraisingLink || resumed.settings.fundraisingLink || "";

  // Persist as active
  active = resumed;
  saveActiveChallenge(active);

  // Choose a sensible park (park of last event, else first park)
  let parkId = (getParksForResort(resumed.resortId)[0]?.id) || "mk";
  if (Array.isArray(resumed.events) && resumed.events.length) {
    const last = resumed.events[resumed.events.length - 1];
    const ride = ridesById.get(last.rideId);
    if (ride?.park) parkId = ride.park;
  }

  setHeaderEnabled(true);
  currentResort = resumed.resortId;
  currentChallengeMode = resumed.challengeMode || "standard";
  setRidesForResort(currentResort);
  setupParksDropdown();
  setupPointsParkPicker();

  currentPark = parkId;
  parkSelect.value = parkId;
  updatePointsParkPickerLabel();
  rememberSelectedPark(currentPark, currentResort);
  applyParkTheme(currentPark);

  renderParkPage({ readOnly: false });
  
  }

function applyParkTheme(parkId) {
  const t = PARK_THEME[parkId] || PARK_THEME.mk;
  document.documentElement.style.setProperty("--park", t.park);
  document.documentElement.style.setProperty("--park2", t.park2);
  document.documentElement.style.setProperty("--parkText", t.parkText);
}

function renderStartPage(resortId = currentResort || "wdw", challengeMode = currentChallengeMode || "standard") {
  currentChallengeMode = challengeMode || "standard";
  setRidesForResort(resortId);
  applyParkTheme(resortId === "dlr" ? "dlrHome" : "wdwHome");
  setHeaderEnabled(false);
  const resort = getResort(resortId);
  const defaultTags = currentChallengeMode === "points" ? POINTS_DEFAULT_TAGS : (resort.startDefaults?.tagsText || "");
  const defaultPark = getParksForResort(resortId)[0]?.id || "mk";

  appEl.innerHTML = `
    <div class="stack startPage">
      <div class="card">
        <div class="h1">${currentChallengeMode === "points" ? "Every Ride WDW Points Challenge" : `Every Ride ${resortId.toUpperCase()} Challenge`}</div>
        <p class="p">
          This app may help you track your ${resortId.toUpperCase()} challenge run and generate draft tweets for you.
        </p>
        <p class="p" style="margin-top:10px;">
          Modify tags and hashtags and add a link to your fundraising page below.
        </p>
        <div class="btnRow" style="margin-top:12px; gap:10px;">
          <button id="backToResortsBtn" class="btn btnPrimary" type="button">Back to resort selector</button>
        </div>
      </div>

      <div id="resumeCardHost"></div>

      <div class="card">
        <div class="h1">Start a new challenge</div>

        <div class="formRow">
          <div class="label">Tags and hashtags (modify as needed)</div>
          <textarea id="tagsText" class="textarea" style="min-height:80px;">${escapeHtml(defaultTags)}</textarea>
        </div>

        <div class="formRow" style="margin-top:12px;">
          <div class="label">My fundraising link (modify as needed)</div>
          <input id="fundLink" class="input" placeholder="https://..." />
        </div>

        <div class="card" style="margin-top:12px; border:2px solid var(--park); background:#ffffff;">
          <div class="h1" style="font-size:16px; color:var(--park);">Unverified Twitter User? Consider Twofer mode</div>
          <p class="p" style="margin-top:6px;">Twofer mode creates one draft tweet for every two rides instead of every ride.</p>
          <div class="radioList" style="margin-top:10px;">
            <label class="btn btnInverse" style="display:flex; align-items:center; justify-content:flex-start; gap:10px; width:100%; margin-bottom:8px;">
              <input type="radio" name="tweetMode" value="original" checked />
              <span>Original mode: tweet every ride</span>
            </label>
            <label class="btn btnInverse" style="display:flex; align-items:center; justify-content:flex-start; gap:10px; width:100%;">
              <input type="radio" name="tweetMode" value="twofer" />
              <span>Twofer mode: tweet every 2nd ride</span>
            </label>
          </div>
          <div class="btnRow" style="margin-top:10px;">
            <button id="twoferInfoBtn" class="btn btnPrimary" type="button">What's This?</button>
          </div>
        </div>

        
        <div class="card" style="margin-top:12px; border: 1px solid rgba(17,24,39,0.12);">
          <div class="h1" style="font-size:16px;">Exclude rides (refurb / custom challenge)</div>
           <p class="p" style="margin-top:6px;"> Click to exclude rides that are not operating today, or to create a custom challenge. </p>
          <div class="btnRow" style="margin-top:10px;">
            <button id="excludedRidesBtn" class="btn btnInverse" type="button">Rides excluded: 0 of 0</button>
          </div>
        </div>

        <div class="btnRow" style="margin-top:12px;">
          <button id="startBtn" class="btn btnPrimary" type="button">Start new challenge</button>
          <button id="viewSavedBtn" class="btn btnInverse" type="button">Previous challenges</button>
        </div>
          </div>
        </div>
      `;
  
  // Back to resort selection
  document.getElementById("backToResortsBtn")?.addEventListener("click", () => {
    navigateToHome();
  });

  // Resume most recent challenge (within last 36 hours) for this resort
  const resumeHost = document.getElementById("resumeCardHost");
  if (resumeHost) {
    const mostRecent = getMostRecentHistoryEntryForResort(resortId, currentChallengeMode);
    const isRecent = mostRecent && isWithinHours(mostRecent, 36);
    if (isRecent) {
      const when = Date.parse(mostRecent.endedAt || mostRecent.startedAt || "") || 0;
      const ridesLogged = Array.isArray(mostRecent.events) ? mostRecent.events.length : 0;

      resumeHost.innerHTML = `
        <div class="card">
          <div class="h1">Resume</div>
          <p class="p">Most recent ${resortId.toUpperCase()} challenge (${ridesLogged} rides logged).</p>
          <div class="btnRow" style="margin-top:12px;">
            <button id="resumeBtn" class="btn btnPrimary" type="button">Resume most recent challenge</button>
          </div>
        </div>
      `;

      
      document.getElementById("resumeBtn")?.addEventListener("click", () => {
        resumeHistoryChallenge(mostRecent);
      });
    } else {
      resumeHost.innerHTML = "";
    }
  }


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
      parkFilter: new Set([defaultPark]),
      persistMode: "draft"
    });
  });

  document.getElementById("twoferInfoBtn")?.addEventListener("click", () => {
    openDialog({
      title: "What is Twofer mode?",
      body: "Twofer mode is for unverified Twitter users who may have a daily tweet limit. Instead of opening a draft tweet after every ride, the app opens one draft after every 2nd ride. That draft includes both ride entries. If you finish with an odd number of rides, the final ride gets its own draft tweet. If you stop before completing the challenge, End challenge will offer to create the final pending tweet before saving your run.",
      content: "",
      buttons: [
        { text: "Got it", className: "btn btnPrimary", action: () => closeDialog() }
      ]
    });
  });

  document.getElementById("startBtn")?.addEventListener("click", () => {
    const tagsText = document.getElementById("tagsText").value ?? "";
    const fundraisingLink = document.getElementById("fundLink").value ?? "";

    active = startNewChallenge({ tagsText, fundraisingLink });

    active.resortId = currentResort || resortId || "wdw";
    active.challengeMode = currentChallengeMode || "standard";

    const tweetMode = document.querySelector('input[name="tweetMode"]:checked')?.value === "twofer"
      ? "twofer"
      : "original";
    active.tweetMode = tweetMode;
    active.settings = active.settings || {};
    active.settings.tweetMode = tweetMode;

    // Copy “excluded rides” draft into the new active challenge
    const excludedIds = loadExcludedDraftIds();
    active.excludedRideIds = excludedIds;
    active.settings = active.settings || {};
    active.settings.excludedRideIds = excludedIds;

    // Clear draft once the run starts (tomorrow starts fresh)
    clearExcludedDraftIds();

    // Make sure tweet builder can read these no matter where storage keeps them.
    active.parkBonuses = active.parkBonuses || {};
    active.tagsText = tagsText;
    active.fundraisingLink = fundraisingLink;
    saveActiveChallenge(active);

    setHeaderEnabled(true);
    currentPark = defaultPark;
    parkSelect.value = currentPark;
    setupPointsParkPicker();
    updatePointsParkPickerLabel();
    rememberSelectedPark(currentPark, currentResort);
    applyParkTheme(currentPark);
    renderParkPage({ readOnly: false });
  });

  document.getElementById("viewSavedBtn")?.addEventListener("click", () => {
    openSavedChallengesDialog();
  });
}

function openExcludedRidesDialog({ excludedIds, parkFilter, persistMode = "draft" }) {
  if (!parkFilter || parkFilter.size === 0) {
    const first = getParksForResort(currentResort || "wdw")[0]?.id || "mk";
    parkFilter = new Set([first]);
  }

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

  const parks = getParksForResort(currentResort || "wdw");
  // Exclusive selection: pick the first value if set, otherwise default to the resort's first park
  const selected = parkFilter && parkFilter.size ? [...parkFilter][0] : (parks[0]?.id || "mk");

  const labelFor = (pid) => pid.toUpperCase();

  return `
    <div class="formRow">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        ${parks.map(p => chip(labelFor(p.id), selected === p.id, p.id)).join("")}
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
            .filter(r => parkFilter.has(r.park))
            .sort(sortBySortKey);

    const excludedSection = `
      <div style="margin-top:10px;font-weight:900;">Excluded from today's challenge (${excludedRides.length})</div>
      <div style="margin-top:8px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;overflow:hidden;">
        ${excludedRides.length
          ? excludedRides.map((r, idx) => `
          <div style="${idx ? "border-top:1px solid #e5e7eb;" : ""}">
            ${renderPickRow(r, true)}
          </div>
        `).join("")
          : `<div style="padding:10px;color:#6b7280;">No rides excluded yet.</div>`}
      </div>
    `;

    const includedSection = `
      <div style="margin-top:14px;font-weight:900;">Included (tap to exclude)</div>
      <div style="margin-top:8px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;overflow:hidden;">
        ${
          parkFilter.size === 0
            ? `<div style="padding:10px;color:#6b7280;">Select at least 1 park</div>`
            : (includedRides.length
                ? includedRides.map((r, idx) => `
                    <div style="${idx ? "border-top:1px solid #e5e7eb;" : ""}">
                      ${renderPickRow(r, false)}
                    </div>
                  `).join("")
                : `<div style="padding:10px;color:#6b7280;">No rides found for the selected parks.</div>`)
        }
      </div>
    `;

    return `
      ${renderParkFilters()}
      ${excludedSection}
      ${includedSection}
    `;
  }

  function updateStartPageCountIfPresent() {
    const btn = document.getElementById("excludedRidesBtn");
    if (btn) btn.textContent = `Rides excluded: ${excludedIds.size} of ${rides.length}`;
  }

  function rerenderBody() {
    const body = document.getElementById("excludedDialogBody");
    if (body) body.innerHTML = renderContent();
    wireHandlers();
  }

  function persistDraft() {
    saveExcludedDraftIds([...excludedIds]);
    updateStartPageCountIfPresent();
  }

  function persistActive() {
    if (!active) return;

    const idsArr = [...excludedIds];
    active.excludedRideIds = idsArr;
    active.settings = active.settings || {};
    active.settings.excludedRideIds = idsArr;

    reconcileClaimedParkBonuses();
    saveActiveChallenge(active);

    // Apply immediately to park pages
    renderParkPage({ readOnly: false });
  }

  function canAddExclusionMidRun(rideId) {
    if (!active) return true;
    const completedMap = buildCompletedMap(active.events || []);
    return !completedMap.has(rideId);
  }

  function toggleRide(id) {
    const isRemoving = excludedIds.has(id);

    if (isRemoving) {
      excludedIds.delete(id);
      if (persistMode === "draft") persistDraft();
      else persistActive();
      rerenderBody();
      return;
    }

    // Adding an exclusion
    if (persistMode === "active") {
      if (!canAddExclusionMidRun(id)) {
        showToast("That ride is already completed. Undo the completion to exclude it.");
        // Do not change state; keep UI consistent (checkbox won't flip)
        rerenderBody();
        return;
      }
    }

    excludedIds.add(id);
    if (persistMode === "draft") persistDraft();
    else persistActive();
    rerenderBody();
  }

  function wireHandlers() {
    // Exclusive park selection (radio)
    document.querySelectorAll('input[name="parkPick"][data-park]').forEach(rb => {
      rb.addEventListener("change", () => {
        const p = rb.getAttribute("data-park");
        if (!p) return;
        parkFilter = new Set([p]);
        rerenderBody();
      });
    });

    // Row click toggles
    document.querySelectorAll("[data-pick]").forEach(row => {
      const id = row.getAttribute("data-pick");
      if (!id) return;

      row.addEventListener("click", (e) => {
        if (e.target && e.target.matches && e.target.matches("input[type='checkbox']")) return;
        toggleRide(id);
      });

      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleRide(id);
        }
      });
      row.tabIndex = 0;
    });

    // Checkbox toggles
    document.querySelectorAll("[data-pickcb]").forEach(cb => {
      cb.addEventListener("change", () => {
        const id = cb.getAttribute("data-pickcb");
        if (!id) return;
        toggleRide(id);
      });
    });
  }

  openDialog({
    title: "Rides excluded today",
    body: "",
    content: `
      <div style="max-height:70vh; overflow:auto; padding-right:2px;">
        <div id="excludedDialogBody">${renderContent()}</div>
      </div>
    `,
    buttons: [
      { text: "Done", className: "btn btnPrimary", action: () => closeDialog() }
    ]
  });

  // Keep this dialog anchored to the top so it doesn't "recenter" when content changes
  const backdrop = document.querySelector(".dialogBackdrop");
  if (backdrop) backdrop.style.alignItems = "flex-start";
  const dlg = document.querySelector(".dialog");
  if (dlg) dlg.style.marginTop = "12px";

  wireHandlers();
}

/* ==========================
   Saved Challenges UI
   ========================== */

function openSavedChallengesDialog() {
  const rid = currentResort || "wdw";
  const hist = loadChallengeHistory().filter(x =>
    (x.resortId || "wdw") === rid &&
    (x.challengeMode || "standard") === (currentChallengeMode || "standard")
  );

  const sorted = [...hist].sort((a, b) => {
    const ta = Date.parse(a.endedAt || a.startedAt || "") || 0;
    const tb = Date.parse(b.endedAt || b.startedAt || "") || 0;
    return tb - ta;
  });

  const saved = sorted.filter(x => x.saved === true);
  const recent = sorted.filter(x => x.saved !== true).slice(0, 20);

  const rowHtml = (ch, section) => {
    const dateLabel = formatDayKeyLong(ch.dayKey);
    const ridesCount = (ch.events?.length ?? 0);

    const viewBtn = `<button class="smallBtn" type="button" data-hview="${ch.id}">View</button>`;

    const saveBtn = section === "recent"
      ? `<button class="smallBtn" type="button" data-hsave="${ch.id}">Save</button>`
      : `<button class="smallBtn smallBtn--spacer" type="button" disabled>Save</button>`;

    const delBtn = `<button class="smallBtn" type="button" data-hdel="${ch.id}">Delete</button>`;

    return `
      <tr>
        <td style="white-space:nowrap;">${escapeHtml(dateLabel)}</td>
        <td style="text-align:center; white-space:nowrap;">${ridesCount}</td>
        <td style="white-space:nowrap; text-align:right;">
          ${saveBtn}
          ${viewBtn}
          ${delBtn}
        </td>
      </tr>
    `;
  };

  const tableHtml = (title, rowsHtml) => `
    <div style="margin-top:10px;">
      <div style="font-weight:700; margin:8px 0;">${escapeHtml(title)}</div>
      <div style="overflow:auto; border:1px solid #e5e7eb; border-radius:12px;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="text-align:left; padding:10px;">Date</th>
              <th style="text-align:center; padding:10px;">Rides</th>
              <th style="text-align:right; padding:10px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="3" style="padding:12px; color:#6b7280;">None yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  openDialog({
    title: "Challenges Saved on this Device",
    body: "",
    content: `
      ${tableHtml("Saved", saved.map(ch => rowHtml(ch, "saved")).join(""))}
      ${tableHtml("Recent (last 20)", recent.map(ch => rowHtml(ch, "recent")).join(""))}
    `,
    buttons: [{ text: "Close", className: "btn btnPrimary", action: () => closeDialog() }]
  });

  // Wire buttons
  dialogHost.querySelectorAll("[data-hview]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-hview");
      const ch = loadChallengeHistory().find(x =>
        x.id === id &&
        (x.resortId || "wdw") === (currentResort || "wdw") &&
        (x.challengeMode || "standard") === (currentChallengeMode || "standard")
      );
      if (!ch) return;

      if (!ch.events || ch.events.length === 0) {
        showToast("No rides in this challenge.");
        return;
      }

      try {
        const { blob, headerText } = await renderUpdateImagePng(ch);
        showUpdateImageDialog({ blob, headerText });
      } catch (e) {
        console.error(e);
        showToast("Sorry — could not create the image on this device.");
      }
    });
  });

  dialogHost.querySelectorAll("[data-hsave]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-hsave");
      setChallengeSaved(id, true);
      // Re-open to refresh UI
      closeDialog();
      openSavedChallengesDialog();
      showToast("Saved.");
    });
  });

  dialogHost.querySelectorAll("[data-hdel]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-hdel");

      openConfirmDialog({
        title: "Delete this challenge?",
        body: "This will remove it from your device.",
        confirmText: "Delete",
        confirmClass: "btnDanger",
        onConfirm: () => {
          deleteChallengeFromHistory(id);
          // refresh Saved Challenges dialog
          closeDialog();
          openSavedChallengesDialog();
        }
      });
    });
  });
}

/* ==========================
   Park page + ride logging
   ========================== */
function getParkDisplayName(parkId, resortId = currentResort) {
  const rid = resortId || "wdw";
  const parks = getParksForResort(rid);
  const hit = parks.find(p => p.id === parkId);
  if (hit) return hit.name;

  // Fallback: search all resorts (for rendering historical runs)
  for (const r of Object.values(RESORTS)) {
    const h2 = r.parks.find(p => p.id === parkId);
    if (h2) return h2.name;
  }

  return parkId;
}

function buildParkCompletionTweetMainText(parkName) {
  return `✅ ${parkName} complete!`;
}

function getPointsRequiredRidesForPark(parkId) {
  return rides.filter(r => r.park === parkId && !POINTS_OPTIONAL_RIDE_IDS.has(r.id));
}

function getIncompleteRequiredRidesForPark(parkId) {
  if (!active) return [];
  const completedMap = buildCompletedMap(active.events || []);
  const excludedSet = getExcludedSetForActive();
  return getPointsRequiredRidesForPark(parkId).filter(r => !completedMap.has(r.id) && !excludedSet.has(r.id));
}

function isPointsParkEligible(parkId) {
  return getIncompleteRequiredRidesForPark(parkId).length === 0;
}

function getRidePoints(rideOrEvent) {
  if (!rideOrEvent) return 0;
  if (Number.isFinite(Number(rideOrEvent.points))) return Number(rideOrEvent.points);
  const ride = ridesById.get(rideOrEvent.rideId || rideOrEvent.id);
  return Number.isFinite(Number(ride?.points)) ? Number(ride.points) : 0;
}

function getCurrentPointsTotal(ch = active) {
  if (!ch || (ch.challengeMode || currentChallengeMode) !== "points") return 0;
  const rideTotal = (ch.events || []).reduce((sum, e) => sum + getRidePoints(e), 0);
  const bonusTotal = Object.values(ch.parkBonuses || {}).reduce((sum, b) => sum + (b?.claimed ? Number(b.points || 0) : 0), 0);
  return rideTotal + bonusTotal;
}

function reconcileClaimedParkBonuses() {
  if (!active || !isPointsMode()) return false;
  active.parkBonuses = active.parkBonuses || {};
  let changed = false;
  for (const parkId of Object.keys(POINTS_PARK_BONUSES)) {
    const bonus = active.parkBonuses[parkId];
    if (bonus?.claimed && !isPointsParkEligible(parkId)) {
      delete active.parkBonuses[parkId];
      changed = true;
    }
  }
  return changed;
}

function getPointsParkBonusState(parkId) {
  return active?.parkBonuses?.[parkId] || null;
}

function openPointsParkIncompleteDialog(parkId) {
  const missing = getIncompleteRequiredRidesForPark(parkId);
  let body = "";
  if (missing.length === 1) {
    body = `${missing[0].name} is not marked complete. Complete all rides in the app to claim the park bonus. If the attraction is closed for refurbishment, go to More → Excluded rides and mark it excluded.`;
  } else if (missing.length === 2) {
    body = `${missing[0].name} and ${missing[1].name} are not marked complete. Complete all rides in the app to claim the park bonus. If either attraction is closed for refurbishment, go to More → Excluded rides and mark it excluded.`;
  } else {
    body = `${missing.length} rides are not marked complete. Complete all rides in the app to claim the park bonus. If any are closed for refurbishment, go to More → Excluded rides and mark them excluded.`;
  }
  openDialog({
    title: "Park not yet complete",
    body,
    content: "",
    buttons: [{ text: "OK", className: "btn btnPrimary", action: () => closeDialog() }]
  });
}

function claimPointsParkBonus(parkId) {
  if (!active || !isPointsMode()) return;
  if (!isPointsParkEligible(parkId)) {
    openPointsParkIncompleteDialog(parkId);
    return;
  }
  active.parkBonuses = active.parkBonuses || {};
  if (active.parkBonuses[parkId]?.claimed) return;
  const bonusPoints = POINTS_PARK_BONUSES[parkId] || 0;
  active.parkBonuses[parkId] = {
    claimed: true,
    points: bonusPoints,
    timestamp: new Date().toISOString()
  };
  saveActiveChallenge(active);
  const parkName = getParkDisplayName(parkId);
  const mainText = `✅ ${parkName} completion bonus (+${bonusPoints} pts)
Total points: ${getCurrentPointsTotal()}`;
  openTweetDraft(mainText);
  renderParkPage({ readOnly: false });
}

function isParkCompleteNow(parkId) {
  if (!active) return false;

  const parkRides = isPointsMode() ? getPointsRequiredRidesForPark(parkId) : rides.filter(r => r.park === parkId);
  const completedMap = buildCompletedMap(active.events || []);
  const excludedSet = getExcludedSetForActive();

  return parkRides.every(r => completedMap.has(r.id) || excludedSet.has(r.id));
}


function normalizeWaitEntityName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStandbyWaitFromLiveEntity(entity) {
  const wait = entity?.queue?.STANDBY?.waitTime;
  return Number.isFinite(wait) ? wait : null;
}

function buildWaitTimesSnapshot(data) {
  const liveData = Array.isArray(data?.liveData) ? data.liveData : [];
  const byId = new Map();
  const byName = new Map();
  let newestUpdated = null;

  for (const entity of liveData) {
    if (entity?.entityType !== "ATTRACTION") continue;
    if (entity.id) byId.set(entity.id, entity);
    if (entity.name) byName.set(normalizeWaitEntityName(entity.name), entity);

    if (entity.lastUpdated) {
      const t = Date.parse(entity.lastUpdated);
      if (Number.isFinite(t) && (!newestUpdated || t > newestUpdated)) newestUpdated = t;
    }
  }

  return { byId, byName, newestUpdated, fetchedAt: Date.now() };
}

function getWaitEntityForRide(ride, snapshot) {
  if (!snapshot) return null;
  if (ride.themeparksWikiId && snapshot.byId.has(ride.themeparksWikiId)) {
    return snapshot.byId.get(ride.themeparksWikiId);
  }

  const candidateNames = [
    ride.themeparksWikiName,
    ...(WAIT_ENTITY_ALIASES[ride.id] || []),
    ride.name
  ].filter(Boolean);

  // Prefer exact normalized-name matches. This safely handles punctuation and
  // apostrophe differences while still allowing current/seasonal Disney names.
  for (const name of candidateNames) {
    const exact = snapshot.byName.get(normalizeWaitEntityName(name));
    if (exact) return exact;
  }

  // Some Disney entities append a qualifier to the base attraction name
  // (for example seasonal overlays or gondola variants). Only accept a
  // prefix match when it resolves to exactly one live attraction.
  for (const name of candidateNames) {
    const normalized = normalizeWaitEntityName(name);
    if (!normalized) continue;
    const matches = [];
    for (const [liveName, entity] of snapshot.byName.entries()) {
      if (liveName.startsWith(`${normalized} `) || normalized.startsWith(`${liveName} `)) {
        matches.push(entity);
      }
    }
    if (matches.length === 1) return matches[0];
  }

  return null;
}

function formatWaitTimeLabel(entity) {
  if (!entity) return "";

  const wait = getStandbyWaitFromLiveEntity(entity);
  if (wait !== null) return `${wait} min`;

  const status = String(entity.status || "").toUpperCase();
  if (status === "DOWN") return "Down";
  if (status === "REFURBISHMENT") return "Refurb";
  if (status === "CLOSED") return "Closed";
  return "—";
}

function formatWaitUpdateTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderWaitTimesMeta(parkId) {
  if (!THEMEPARKS_WIKI_PARK_IDS[parkId]) return "";

  const snapshot = waitTimesCache.get(parkId);
  const updated = snapshot ? formatWaitUpdateTime(snapshot.newestUpdated || snapshot.fetchedAt) : "";

  return `
    <div class="waitTimesMeta" id="waitTimesMeta">
      <span>${updated ? `Waits updated ${escapeHtml(updated)}` : "Loading posted waits…"}</span>
      <span class="waitTimesDot">•</span>
      <a href="https://themeparks.wiki/" target="_blank" rel="noopener noreferrer">Powered by ThemeParks.wiki</a>
    </div>
  `;
}

function applyWaitTimesToParkPage(parkId) {
  if (parkId !== currentPark) return;
  const snapshot = waitTimesCache.get(parkId);
  if (!snapshot) return;

  const parkRides = rides.filter(r => r.park === parkId);
  for (const ride of parkRides) {
    const el = document.querySelector(`[data-wait-ride="${ride.id}"]`);
    if (!el) continue;

    const entity = getWaitEntityForRide(ride, snapshot);
    const label = formatWaitTimeLabel(entity);
    if (!label) {
      el.textContent = "";
      el.hidden = true;
      continue;
    }

    el.textContent = label;
    el.hidden = false;
    const status = String(entity?.status || "").toUpperCase();
    el.classList.toggle("waitDown", status === "DOWN");
    el.classList.toggle("waitClosed", status === "CLOSED" || status === "REFURBISHMENT");
  }

  const meta = document.getElementById("waitTimesMeta");
  if (meta) {
    const updated = formatWaitUpdateTime(snapshot.newestUpdated || snapshot.fetchedAt);
    meta.querySelector("span")?.replaceChildren(document.createTextNode(updated ? `Waits updated ${updated}` : "Posted waits loaded"));
  }
}

async function loadWaitTimesForPark(parkId, { force = false } = {}) {
  const entityId = THEMEPARKS_WIKI_PARK_IDS[parkId];
  if (!entityId) return;

  const cached = waitTimesCache.get(parkId);
  if (!force && cached && Date.now() - cached.fetchedAt < WAIT_TIMES_REFRESH_MS) {
    applyWaitTimesToParkPage(parkId);
    return;
  }

  if (waitTimesRequests.has(parkId)) return waitTimesRequests.get(parkId);

  const request = fetch(`https://api.themeparks.wiki/v1/entity/${entityId}/live`, { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`Wait-time API returned HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      waitTimesCache.set(parkId, buildWaitTimesSnapshot(data));
      applyWaitTimesToParkPage(parkId);
    })
    .catch(error => {
      // Wait times are an optional enhancement. Never interfere with challenge logging.
      console.warn("Unable to load posted wait times:", error);
      const meta = document.getElementById("waitTimesMeta");
      if (parkId === currentPark && meta) meta.hidden = true;
    })
    .finally(() => {
      waitTimesRequests.delete(parkId);
    });

  waitTimesRequests.set(parkId, request);
  return request;
}

function renderParkPage({ readOnly = false } = {}) {
  if (!active) return;

  if (reconcileClaimedParkBonuses()) saveActiveChallenge(active);

  const parkRides = rides
    .filter(r => r.park === currentPark)
    .sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", "en", { sensitivity: "base" }));

  const completedMap = buildCompletedMap(active.events);

  // Header pills
  counterPill.textContent = `Rides: ${active.events.length}`;
  if (pointsPill) pointsPill.textContent = `Pts: ${getCurrentPointsTotal()}`;
  updatePointsParkPickerLabel();

  const excludedSet = getExcludedSetForActive();
  const parkName = getParkDisplayName(currentPark);

  let parkActionHtml = "";
  if (isPointsMode()) {
    const claimed = getPointsParkBonusState(currentPark)?.claimed === true;
    const bonusPoints = POINTS_PARK_BONUSES[currentPark] || 0;
    parkActionHtml = `
      <div style="display:flex; justify-content:center; margin-top:16px;">
        ${claimed
          ? `<div class="bonusClaimedStatus">Park bonus claimed: +${bonusPoints} pts</div>`
          : `<button id="claimParkBonusBtn" class="btn btnPrimary" type="button">Claim park bonus</button>`}
      </div>`;
  } else {
    const parkComplete = parkRides.every(r => completedMap.has(r.id) || excludedSet.has(r.id));
    if (parkComplete) {
      parkActionHtml = `
        <div style="display:flex; justify-content:center; margin-top:16px;">
          <button id="parkCompleteTweetBtn" class="btn btnPrimary" type="button">${escapeHtml(`${parkName} complete! Click to tweet`)}</button>
        </div>`;
    }
  }

  appEl.innerHTML = `
    <div class="stack">
      ${parkActionHtml}
      <div class="rides" role="list">
        ${parkRides.map(r => renderRideRow(r, completedMap, readOnly)).join("")}
      </div>
      ${renderWaitTimesMeta(currentPark)}
    </div>`;

  loadWaitTimesForPark(currentPark);

  if (!readOnly && isPointsMode()) {
    document.getElementById("claimParkBonusBtn")?.addEventListener("click", () => claimPointsParkBonus(currentPark));
  } else if (!readOnly) {
    document.getElementById("parkCompleteTweetBtn")?.addEventListener("click", () => {
      const mainText = buildParkCompletionTweetMainText(parkName);
      openTweetDraft(mainText);
    });
  }

  // Wire ride row buttons / undo-edit
  for (const r of parkRides) {
    const info = completedMap.get(r.id);
    const isCompleted = !!info;
    const isExcluded = excludedSet.has(r.id);

    if (!readOnly) {
      if (!isExcluded && !isCompleted) {
        document.querySelector(`[data-line="${r.id}:standby"]`)?.addEventListener("click", () => logRide(r, "standby"));
        if (r.ll) document.querySelector(`[data-line="${r.id}:ll"]`)?.addEventListener("click", () => logRide(r, "ll"));
        if (r.sr) document.querySelector(`[data-line="${r.id}:sr"]`)?.addEventListener("click", () => logRide(r, "sr"));
      }

      if (!isExcluded) {
        document.querySelector(`[data-undo="${r.id}"]`)?.addEventListener("click", () => {
          const eventInfo = completedMap.get(r.id);
          if (!eventInfo) return;
          openUndoEditDialog(r, eventInfo);
        });
      }
    }
  }
}


function renderRideRow(r, completedMap, readOnly) {
  const info = completedMap.get(r.id);
  const completed = !!info;

  // Excluded rides apply only if NOT completed
  const excludedSet = getExcludedSetForActive();
  const excluded = !completed && excludedSet.has(r.id);

  const hasLL = !!r.ll;
  const hasSR = !!r.sr;

  // Ride name plus optional posted standby wait. Wait remains hidden until live data is available.
  const initialWaitEntity = getWaitEntityForRide(r, waitTimesCache.get(currentPark));
  const initialWaitLabel = formatWaitTimeLabel(initialWaitEntity);
  const nameHtml = `
    <div class="rideTitleRow">
      <p class="rideName">${escapeHtml(r.name)}${isPointsMode() ? ` <span class="ridePoints">(${getRidePoints(r)} pts)</span>` : ""}</p>
      <span class="rideWait" data-wait-ride="${r.id}" ${initialWaitLabel ? "" : "hidden"}>${escapeHtml(initialWaitLabel)}</span>
    </div>
  `;

  // Row 2 for excluded rides
  const excludedMetaHtml = excluded
    ? `<div class="excludedMeta">
         <div class="excludedNote">Excluded from today's challenge</div>
       </div>`
    : "";

  // Row 2 for completed rides: "- completed using ..."
  const completedText = completed ? renderCompletedText(info.event.mode, info.event.timeISO) : "";
  const completedMetaHtml = completed
    ? `<div class="completedMeta">
         <div class="completedNote">${escapeHtml(completedText)}</div>
         ${(!readOnly ? `<button class="smallBtn" type="button" data-undo="${r.id}">Undo/Edit</button>` : "")}
       </div>`
    : "";

  // Row 2 for uncompleted rides: ALWAYS show Standby; add LL/SR if applicable
  let buttonsHtml = "";
  if (!completed && !excluded) {
    const colsClass = hasSR ? "three" : (hasLL ? "two" : "one");

    const standbyBtn = renderLineButton(r.id, "standby", "Standby Line", false, readOnly);
    const llBtn = hasLL ? renderLineButton(r.id, "ll", "Lightning Lane", false, readOnly) : "";
    const srBtn = hasSR ? renderLineButton(r.id, "sr", "Single Rider", false, readOnly) : "";

    buttonsHtml = `
      <div class="lineButtons ${colsClass}">
        ${standbyBtn}
        ${llBtn}
        ${srBtn}
      </div>
    `;
  }

  return `
  <div class="rideRow ${completed ? "completed" : ""} ${excluded ? "excluded" : ""}" role="listitem">
    <div class="rideMain">
      ${nameHtml}
      ${excludedMetaHtml}
      ${completedMetaHtml}
      ${buttonsHtml}
    </div>
  </div>
`;
}

function renderLineButton(rideId, mode, label, selected, readOnly) {
  const cls = ["lineBtn"];
  if (selected) cls.push("selected");
  if (readOnly) cls.push("disabled");
  return `
    <button
      type="button"
      class="${cls.join(" ")}"
      ${readOnly ? "disabled" : ""}
      data-line="${rideId}:${mode}">
      ${escapeHtml(label)}
    </button>
  `;
}

function getTweetMode() {
  return active?.tweetMode || active?.settings?.tweetMode || "original";
}

function isTwoferMode() {
  return getTweetMode() === "twofer";
}

function getIncludedRideCountForActive() {
  const excludedSet = getExcludedSetForActive();
  return rides.filter(r => !excludedSet.has(r.id)).length;
}

function isChallengeCompleteForActive() {
  if (!active) return false;
  const totalIncluded = getIncludedRideCountForActive();
  return totalIncluded > 0 && (active.events?.length || 0) >= totalIncluded;
}

function getPendingTwoferEvents() {
  if (!active || !isTwoferMode()) return [];
  const events = active.events || [];
  if (!events.length || isChallengeCompleteForActive()) return [];
  return events.length % 2 === 1 ? [events[events.length - 1]] : [];
}

function getEventsForRideTweetAfterLog() {
  const events = active?.events || [];
  if (!events.length) return [];
  if (!isTwoferMode()) return [events[events.length - 1]];
  if (events.length % 2 === 0) return events.slice(-2);
  if (isChallengeCompleteForActive()) return events.slice(-1);
  return [];
}

function getLightningLaneNumberForEvent(event) {
  if (!active || !event || event.mode !== "ll") return null;
  const idx = (active.events || []).findIndex(e => e.id === event.id);
  if (idx < 0) return null;
  return active.events.slice(0, idx + 1).filter(e => e.mode === "ll").length;
}

function buildRideTweetForEvent(event) {
  const idx = (active?.events || []).findIndex(e => e.id === event.id);
  const ride = ridesById.get(event.rideId);
  const rideName = event.rideName || ride?.name || "Ride";
  const pointsSuffix = isPointsMode() ? ` (${getRidePoints(event)} pts)` : "";
  return buildRideTweet({
    rideNumber: idx >= 0 ? idx + 1 : null,
    rideName: `${rideName}${pointsSuffix}`,
    mode: event.mode,
    timeLabel: event.timeISO ? formatTime(new Date(event.timeISO)) : "",
    llNumber: getLightningLaneNumberForEvent(event)
  });
}

function buildRideBatchTweet(events) {
  const rideLines = (events || []).map(buildRideTweetForEvent).filter(Boolean).join("\n");
  if (!rideLines || !isPointsMode()) return rideLines;
  return `${rideLines}
Total points: ${getCurrentPointsTotal()}`;
}

function renderCompletedText(mode, timeISO) {
  const label =
    mode === "ll" ? "Lightning Lane" :
    mode === "sr" ? "Single Rider" :
    "Standby Line";

  const t = timeISO ? ` at ${formatTime12(new Date(timeISO))}` : "";
  return `- completed using ${label}${t}`;
}

function logRide(ride, mode) {
  if (!active) return;

  // Safety: don't allow logging rides excluded from today's challenge
  const excludedSet = getExcludedSetForActive();
  if (excludedSet.has(ride.id)) {
    showToast("That ride is excluded from today's challenge.");
    return;
  }

  const now = new Date();

  const event = {
    id: crypto.randomUUID(),
    rideId: ride.id,
    park: ride.park,
    mode, // standby | ll | sr
    timeISO: now.toISOString(),
    rideName: ride.name,
    ...(isPointsMode() ? { points: getRidePoints(ride) } : {})
  };

  active.events.push(event);
  saveActiveChallenge(active);

  const eventsToTweet = getEventsForRideTweetAfterLog();
  if (eventsToTweet.length) {
    openTweetDraft(buildRideBatchTweet(eventsToTweet));
  } else if (isTwoferMode()) {
    showToast("Ride logged. Twofer tweet will be created after the next ride.");
  }

  renderParkPage({ readOnly: false });
  if (isPointsMode()) requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
}

function buildRideTweet({ rideNumber, rideName, mode, timeLabel, llNumber }) {
  const base = rideNumber ? `Ride ${rideNumber}. ${rideName}` : `${rideName}`;

  // Only mention the line type if it's NOT standby (standby is the default) and add count of LL
  const mid =
    mode === "ll" ? ` using LL${llNumber ? ` #${llNumber}` : ""}` :
    mode === "sr" ? " using Single Rider" :
    "";

  return `${base}${mid}${timeLabel ? ` at ${timeLabel}` : ""}`;
}

function getTagsAndLinkFromActive() {
  // Prefer top-level fields (app.js reads these), but fall back to storage.js settings.
  const tags = (active?.tagsText ?? active?.settings?.tagsText ?? "").trim();
  const link = (active?.fundraisingLink ?? active?.settings?.fundraisingLink ?? "").trim();
  return { tags, link };
}

function openTweetDraft(mainText) {
  const { tags, link } = getTagsAndLinkFromActive();

  let fullText = (mainText ?? "").trim();
  if (tags) fullText += "\n\n" + tags;
  if (link) fullText += "\n\n" + link;

  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", fullText);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function buildCompletedMap(events) {
  const m = new Map();
  events.forEach((e, idx) => m.set(e.rideId, { index: idx, event: e }));
  return m;
}

/* ==========================
   Tweet update (image) logic
   ========================== */

function mediumRideNameFor(rideId, fallbackName) {
  const r = ridesById.get(rideId);
  return (r && (r.mediumName || r.name)) ? (r.mediumName || r.name) : (fallbackName || "");
}

function lineAbbrev(mode) {
  if (mode === "ll") return "LL";
  if (mode === "sr") return "SR";
  return "";
}

function formatTime12(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t.length ? t + "…" : "";
}

async function renderUpdateImagePng(ch) {
  const events = ch?.events || [];
  const pointsMode = isPointsMode(ch);

  // For Points mode, park bonuses are explicit timestamped events for ordering,
  // even though their claim time is intentionally not printed in the image.
  const bonusRows = pointsMode
    ? Object.entries(ch?.parkBonuses || {})
        .filter(([, bonus]) => bonus?.claimed)
        .map(([parkId, bonus]) => ({
          rowType: "bonus",
          parkId,
          timestamp: bonus.timestamp || "",
          points: Number(bonus.points || POINTS_PARK_BONUSES[parkId] || 0)
        }))
    : [];

  const imageRows = pointsMode
    ? [
        ...events.map((event, eventIndex) => ({ rowType: "ride", event, eventIndex, timestamp: event.timeISO || "" })),
        ...bonusRows
      ].sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      })
    : events.map((event, eventIndex) => ({ rowType: "ride", event, eventIndex, timestamp: event.timeISO || "" }));

  // "As of" is the latest scored/logged action in Points mode, otherwise latest ride.
  const actionTimes = pointsMode
    ? [
        ...events.map(e => e.timeISO).filter(Boolean),
        ...bonusRows.map(b => b.timestamp).filter(Boolean)
      ]
    : events.map(e => e.timeISO).filter(Boolean);

  const latestTime = actionTimes
    .map(t => new Date(t))
    .filter(d => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a)[0];

  const asOfDate = latestTime || new Date();

  // Use the challenge day for the date label (unchanged)
  const dateLabel = formatDayKeyLong(ch?.dayKey);

  // Header lines
  const headerLine1 = dateLabel
    ? `${dateLabel} challenge run`
    : `Challenge run`;

  const headerLine2 = pointsMode
    ? `${getCurrentPointsTotal(ch)} points • ${events.length} rides as of ${formatTime12(asOfDate)}`
    : `${events.length} rides as of ${formatTime12(asOfDate)}`;

  // Keep returning headerText for share text (use both lines)
  const headerText = `${headerLine1} — ${headerLine2}`;

  const pad = 22;
  const rowH = 34;
  const headH = 84;
  const headerRowH = 42;

  const colN = 52;
  const colTime = 110;
  const colLine = 70;
  const colPoints = pointsMode ? 64 : 0;

  const W = 720;
  const tableW = W - pad * 2;
  const colRide = tableW - colN - colTime - colLine - colPoints;

  const H = pad * 2 + headH + headerRowH + imageRows.length * rowH + 18;

  const dpr = Math.max(2, Math.floor(window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = "#111827";

  // Line 1 (date)
  ctx.font = "700 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(headerLine1, pad, pad + 26);

  // Line 2 (score/rides as of time)
  ctx.font = "700 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(headerLine2, pad, pad + 60);

  // divider
  let y = pad + headH;
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();

  // column headers
  y += 28;
  ctx.fillStyle = "#111827";
  ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("#", pad + 8, y);
  ctx.fillText("Time", pad + colN + 8, y);
  ctx.fillText("Ride", pad + colN + colTime + 8, y);
  if (pointsMode) ctx.fillText("Pts", pad + colN + colTime + colRide + 8, y);
  ctx.fillText("LL/SR", pad + colN + colTime + colRide + colPoints + 6, y);

  // rows start
  y += 16;
  ctx.font = "500 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "#111827";
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  for (let i = 0; i < imageRows.length; i++) {
    const row = imageRows[i];
    const rowTop = y + i * rowH;
    const e = row.rowType === "ride" ? row.event : null;

    // Park-tinted background (muted)
    const parkId = row.rowType === "bonus"
      ? row.parkId
      : (e.park || ridesById.get(e.rideId)?.park || "mk");
    const tint = (PARK_THEME[parkId]?.park2) || "rgba(0,0,0,.04)";
    ctx.fillStyle = tint;
    ctx.fillRect(pad, rowTop, tableW, rowH);

    // row divider
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(pad, rowTop);
    ctx.lineTo(W - pad, rowTop);
    ctx.stroke();

    // text
    ctx.fillStyle = "#111827";
    const ty = rowTop + 23;

    if (row.rowType === "bonus") {
      const bonusLabel = `${getParkDisplayName(row.parkId)} park bonus`;
      const bonusText = truncateToWidth(ctx, bonusLabel, colRide - 12);
      ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText(bonusText, pad + colN + colTime + 8, ty);
      ctx.fillText(String(row.points), pad + colN + colTime + colRide + 8, ty);
      ctx.font = "500 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      continue;
    }

    const timeStr = e.timeISO ? formatTime12(new Date(e.timeISO)) : "";
    const rideStr = mediumRideNameFor(e.rideId, e.rideName);
    const rideText = truncateToWidth(ctx, rideStr, colRide - 12);
    const lineStr = lineAbbrev(e.mode);

    ctx.fillText(String(row.eventIndex + 1), pad + 8, ty);
    ctx.fillText(timeStr, pad + colN + 8, ty);
    ctx.fillText(rideText, pad + colN + colTime + 8, ty);
    if (pointsMode) ctx.fillText(String(getRidePoints(e)), pad + colN + colTime + colRide + 8, ty);
    ctx.fillText(lineStr, pad + colN + colTime + colRide + colPoints + 18, ty);
  }

  // bottom border
  const bottomY = y + imageRows.length * rowH;
  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.moveTo(pad, bottomY);
  ctx.lineTo(W - pad, bottomY);
  ctx.stroke();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
  if (!blob) throw new Error("toBlob failed");
  return { blob, headerText };
}

function formatDayKeyLong(dayKey) {
  if (!dayKey) return "";
  // Noon avoids timezone edge cases
  const d = new Date(`${dayKey}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function showUpdateImageDialog({ blob, headerText }) {
  const url = URL.createObjectURL(blob);

  const canShareFile = (() => {
    try {
      const f = new File([blob], "ride-update.png", { type: "image/png" });
      return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] }));
    } catch {
      return false;
    }
  })();

  dialogHost.innerHTML = `
    <div class="dialogBackdrop" role="presentation">
      <div class="dialog" role="dialog" aria-modal="true" style="max-width:520px;">
        <div style="margin:12px 0;">
          <img src="${url}" alt="Update image preview"
               style="width:100%;border:1px solid #e5e7eb;border-radius:12px;" />
        </div>

        <div class="btnRow" style="margin-top:10px;">
          ${canShareFile ? `<button id="shareUpdateImgBtn" type="button" class="btn btnPrimary">Share image</button>` : ""}
          <button id="downloadUpdateImgBtn" type="button" class="btn ${canShareFile ? "" : "btnPrimary"}">Download image</button>
          <button id="closeUpdateImgBtn" type="button" class="btn">Close</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    try { URL.revokeObjectURL(url); } catch {}
    closeDialog();
  };

  dialogHost.querySelector(".dialogBackdrop")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("dialogBackdrop")) close();
  });

  dialogHost.querySelector("#closeUpdateImgBtn")?.addEventListener("click", close);

  dialogHost.querySelector("#downloadUpdateImgBtn")?.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "ride-update.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  const shareBtn = dialogHost.querySelector("#shareUpdateImgBtn");
  shareBtn?.addEventListener("click", async () => {
    try {
      const file = new File([blob], "ride-update.png", { type: "image/png" });
      await navigator.share({
        files: [file],
        text: headerText
      });
    } catch {
      // user cancelled or share failed
    }
  });
}

/* ==========================
   Undo/Edit logic (unchanged)
   ========================== */

function openLineEditDialog(ride, info) {
  if (!active || !info) return;

  const idx = info.index;
  const currentMode = info.event.mode;

  openDialog({
    title: `Edit line used for ${ride.name}?`,
    body: `This will affect future updates only.\nPreviously sent tweets won’t be changed.`,
    content: `
      <div class="radioList">
        ${radioItem("standby", "Standby Line", currentMode)}
        ${radioItem("ll", "Lightning Lane", currentMode, !!ride.ll)}
        ${radioItem("sr", "Single Rider", currentMode, !!ride.sr)}
      </div>
    `,
    buttons: [
      { text: "Save changes", className: "btn btnPrimary", action: () => saveEdit(false) },
      { text: "Save & generate correction tweet", className: "btn", action: () => saveEdit(true) },
      { text: "Cancel", className: "btn", action: () => closeDialog() }
    ]
  });

  function radioItem(value, label, selected, enabled = true) {
    return `
      <label class="radioItem" style="${enabled ? "" : "opacity:.45"}">
        <input type="radio" name="mode" value="${value}" ${selected === value ? "checked" : ""} ${enabled ? "" : "disabled"} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  function saveEdit(withCorrectionTweet) {
    const picked = document.querySelector('input[name="mode"]:checked')?.value ?? currentMode;

    active.events[idx] = { ...active.events[idx], mode: picked };
    saveActiveChallenge(active);

    closeDialog();
    renderParkPage({ readOnly: false });

    showToast("Changes saved for future updates.");

    if (withCorrectionTweet) {
      const rideNumber = idx + 1;
      const line =
        picked === "ll" ? "Lightning Lane" :
        picked === "sr" ? "Single Rider" :
        "Standby Line";
      const txt = `Correction: Ride ${rideNumber}. ${ride.name} was via ${line}.`;
      openTweetDraft(txt);
    }
  }
}

function openUndoEditDialog(ride, eventInfo) {
  const hasAlt = !!ride.ll || !!ride.sr;

  const isMostRecent = eventInfo.index === active.events.length - 1;

  const buttons = [
    {
      text: "Undo completion",
      className: "btn btnPrimary",
      action: () => {
        // If most recent, undo immediately (no renumber warning)
        if (isMostRecent) {
          closeDialog(); // close Undo/Edit popup
          active.events = active.events.filter(e => e.id !== eventInfo.event.id);
          reconcileClaimedParkBonuses();
          saveActiveChallenge(active);
          renderParkPage({ readOnly: false });
          return;
        }

        // Not most recent: show a 2nd confirm popup *after* clicking Undo completion
        openConfirmDialog({
          title: `Undo today’s completion for ${ride.name}?`,
          body: "Note: This will renumber some previous rides.\nPreviously sent tweets won’t be changed.",
          confirmText: "Undo completion",
          onConfirm: () => {
            // Confirm dialog closes itself; also close the Undo/Edit popup behind it
            closeDialog();
            active.events = active.events.filter(e => e.id !== eventInfo.event.id);
            reconcileClaimedParkBonuses();
            saveActiveChallenge(active);
            renderParkPage({ readOnly: false });
          }
        });
      }
    }
  ];

  if (hasAlt) {
    buttons.push({
      text: "Edit line used",
      className: "btn",
      action: () => {
        closeDialog();          // close Undo/Edit popup
        openLineEditDialog(ride, eventInfo); // opens the edit dialog
      }
    });
  }

  buttons.push({
    text: "Cancel",
    className: "btn",
    action: () => closeDialog()
  });

  // Popup #1: always the same, no warning text
  openDialog({
    title: `Undo/Edit: ${ride.name}`,
    body: "",
    content: "",
    buttons
  });
}

/* ==========================
   Dialog + helpers
   ========================== */

function openConfirmDialog({ title, body, confirmText, confirmClass, onConfirm }) {
  openDialog({
    title,
    body: body || "",
    content: "",
    buttons: [
      {
        text: confirmText || "Confirm",
        className: `btn btnPrimary ${confirmClass || ""}`.trim(),
        action: () => { closeDialog(); onConfirm(); }
      },
      { text: "Cancel", className: "btn", action: () => closeDialog() }
    ]
  });
}

function openDialog({ title, body, content, buttons }) {
  dialogHost.innerHTML = `
    <div class="dialogBackdrop" role="presentation">
      <div class="dialog" role="dialog" aria-modal="true">
        <h3>${escapeHtml(title)}</h3>
        ${body ? `<p>${escapeHtml(body).replaceAll("\n", "<br/>")}</p>` : ""}
        ${content || ""}
        <div class="btnRow" style="margin-top:10px;">
          ${buttons.map((b, i) => `<button data-dbtn="${i}" type="button" class="${b.className || "btn"}">${escapeHtml(b.text)}</button>`).join("")}
        </div>
      </div>
    </div>
  `;

  dialogHost.querySelector(".dialogBackdrop")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("dialogBackdrop")) closeDialog();
  });

  buttons.forEach((b, i) => {
    dialogHost.querySelector(`[data-dbtn="${i}"]`)?.addEventListener("click", b.action);
  });
}

function closeDialog() {
  dialogHost.innerHTML = "";
}

function showToast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function formatTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
