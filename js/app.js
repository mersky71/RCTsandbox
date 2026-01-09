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
  mk: { park: "#22d3ee", park2: "rgba(34,211,238,.12)", parkText: "#0b0f14" }, // Cyan
  hs: { park: "#ff3ea5", park2: "rgba(255,62,165,.12)", parkText: "#0b0f14" }, // Magenta
  ep: { park: "#fb923c", park2: "rgba(251,146,60,.12)", parkText: "#0b0f14" }, // Orange
  ak: { park: "#166534", park2: "rgba(22,101,52,.12)", parkText: "#0b0f14" }  // Forest green
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

init();

async function init() {
  setupParksDropdown();
  setupMoreMenu();

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
          <textarea id="settingsTags" class="textarea" style="min-height:90px;">${escapeHtml(currentTags)}</textarea>
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

function renderStartPage() {
  appEl.innerHTML = `
    <div class="stack startPage">
      <div class="card">
        <div class="h1">Welcome</div>
        <p class="p">
          This experimental app helps track rides and generate draft tweets for an Every Ride Challenge.
        </p>
        <p class="p" style="margin-top:10px;">
          It was vibe-coded with ChatGPT and may still have bugs, so please manage your expectations accordingly 🙂
        </p>
        <p class="p" style="margin-top:10px;">
          If it breaks down on you, please be prepared to compose your ride tweets manually!
        </p>
      </div>

      <div class="card">
        <div class="h1">Start a new challenge</div>

        <div class="formRow">
          <div class="label">Tags and hashtags (modify as needed)</div>
          <textarea id="tagsText" class="textarea">#EveryRideWDW @RideEvery
Help me support @GKTWVillage by donating at the link below</textarea>
        </div>

        <div class="formRow" style="margin-top:12px;">
          <div class="label">My fundraising link (modify as needed)</div>
          <input id="fundLink" class="input" placeholder="https://..." />
        </div>

        <div class="btnRow" style="margin-top:12px;">
          <button id="startBtn" class="btn btnPrimary" type="button">Start a new challenge</button>
          <button id="viewSavedBtn" class="btn btnPrimary" type="button">View Saved Challenges</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("startBtn")?.addEventListener("click", () => {
    const tagsText = document.getElementById("tagsText").value ?? "";
    const fundraisingLink = document.getElementById("fundLink").value ?? "";

    active = startNewChallenge({ tagsText, fundraisingLink });

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

/* ==========================
   Saved Challenges UI
   ========================== */

function openSavedChallengesDialog() {
  const hist = loadChallengeHistory();

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
      const ch = loadChallengeHistory().find(x => x.id === id);
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

function renderParkPage({ readOnly = false } = {}) {
  if (!active) return;

  const parkRides = rides
    .filter(r => r.park === currentPark)
    .sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", "en", { sensitivity: "base" }));

  const completedMap = buildCompletedMap(active.events);

  // Header pill text
  counterPill.textContent = `Rides: ${active.events.length}`;

  // Park page now only shows ride list (no park banner card)
  appEl.innerHTML = `
    <div class="stack">
      <div class="rides" role="list">
        ${parkRides.map(r => renderRideRow(r, completedMap, readOnly)).join("")}
      </div>
    </div>
  `;

  for (const r of parkRides) {
    const info = completedMap.get(r.id);
    const isCompleted = !!info;

    if (!readOnly) {
      // Always wire standby; LL/SR only if present. Buttons only exist when NOT completed.
      if (!isCompleted) {
        document.querySelector(`[data-line="${r.id}:standby"]`)?.addEventListener("click", () => logRide(r, "standby"));
        if (r.ll) document.querySelector(`[data-line="${r.id}:ll"]`)?.addEventListener("click", () => logRide(r, "ll"));
        if (r.sr) document.querySelector(`[data-line="${r.id}:sr"]`)?.addEventListener("click", () => logRide(r, "sr"));
      }

      // Undo/Edit button (only exists when completed)
      document.querySelector(`[data-undo="${r.id}"]`)?.addEventListener("click", () => {
        const eventInfo = completedMap.get(r.id);
        if (!eventInfo) return;
        openUndoEditDialog(r, eventInfo);
      });
    }
  }
}

function renderRideRow(r, completedMap, readOnly) {
  const info = completedMap.get(r.id);
  const completed = !!info;

  const hasLL = !!r.ll;
  const hasSR = !!r.sr;

  // Ride name is always just text now (actions happen via buttons)
  const nameHtml = `<p class="rideName">${escapeHtml(r.name)}</p>`;

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
  if (!completed) {
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
  <div class="rideRow ${completed ? "completed" : ""}" role="listitem">
    <div class="rideMain">
      ${nameHtml}
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

  const now = new Date();
  const timeLabel = formatTime(now);
  const rideNumber = active.events.length + 1;

  const event = {
    id: crypto.randomUUID(),
    rideId: ride.id,
    park: ride.park,
    mode, // standby | ll | sr
    timeISO: now.toISOString(),
    rideName: ride.name
  };

  active.events.push(event);
  saveActiveChallenge(active);

  const llNumber =
  mode === "ll"
    ? (active?.events?.filter(e => e.mode === "ll").length || 0)
    : null;

  const tweetText = buildRideTweet({
    rideNumber,
    rideName: ride.name,
    mode,
    timeLabel,
    llNumber
  });

  
  openTweetDraft(tweetText);
  renderParkPage({ readOnly: false });
}

function buildRideTweet({ rideNumber, rideName, mode, timeLabel, llNumber }) {
  const base = `Ride ${rideNumber}. ${rideName}`;

  // Only mention the line type if it's NOT standby (standby is the default) and  add count of LL
  const mid =
    mode === "ll" ? ` using Lightning Lane${llNumber ? ` #${llNumber}` : ""}` :
    mode === "sr" ? " using Single Rider" :
    "";

  return `${base}${mid} at ${timeLabel}`;
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

  // Determine "as of" time = time of most recent ride (fallback to now)
  const lastEvent = [...events]
    .filter(e => e.timeISO)
    .sort((a, b) => new Date(b.timeISO) - new Date(a.timeISO))[0];

  const asOfDate = lastEvent?.timeISO
    ? new Date(lastEvent.timeISO)
    : new Date();

  // Use the challenge day for the date label (unchanged)
  const dateLabel = formatDayKeyLong(ch?.dayKey);

  // Header lines
  const headerLine1 = dateLabel
    ? `${dateLabel} challenge run`
    : `Challenge run`;

  const headerLine2 = `${events.length} rides as of ${formatTime12(asOfDate)}`;

  // Keep returning headerText for share text (use both lines)
  const headerText = `${headerLine1} — ${headerLine2}`;

  const pad = 22;
  const rowH = 34;
  const headH = 84;
  const headerRowH = 42;

  const colN = 52;
  const colTime = 110;
  const colLine = 70;

  const W = 720;
  const tableW = W - pad * 2;
  const colRide = tableW - colN - colTime - colLine;

  const H = pad * 2 + headH + headerRowH + events.length * rowH + 18;

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

  // Line 2 (rides as of time)
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
  ctx.fillText("LL/SR", pad + colN + colTime + colRide + 6, y);

  // rows start
  y += 16;
  ctx.font = "500 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "#111827";
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const rowTop = y + i * rowH;

    // Park-tinted background (muted)
    const parkId = e.park || ridesById.get(e.rideId)?.park || "mk";
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

    const timeStr = e.timeISO ? formatTime12(new Date(e.timeISO)) : "";
    const rideStr = mediumRideNameFor(e.rideId, e.rideName);
    const rideText = truncateToWidth(ctx, rideStr, colRide - 12);
    const lineStr = lineAbbrev(e.mode);

    ctx.fillText(String(i + 1), pad + 8, ty);
    ctx.fillText(timeStr, pad + colN + 8, ty);
    ctx.fillText(rideText, pad + colN + colTime + 8, ty);
    ctx.fillText(lineStr, pad + colN + colTime + colRide + 18, ty);
  }

  // bottom border
  const bottomY = y + events.length * rowH;
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














