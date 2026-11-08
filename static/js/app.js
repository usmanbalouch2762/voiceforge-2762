/* VoiceForge 2762 — frontend controller (written from scratch).
   Flow: health check -> setup screen (while the model loads) ->
   community gate (first visit) -> app shell with Studio / Voices /
   Clone / Batch. All page content is rendered by the init* functions
   below into the page-* containers; the ids must stay in sync with
   static/index.html (page-studio, page-voices, page-clone, page-batch). */
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

let currentPage = "studio";
let studioVoice = { id: "alba", name: "Alba", gender: "female", language: "en",
  description: "Clear, versatile female voice" };
let voicesCache = [];
let setupPollStarted = false;

/* ---------- toasts ---------- */
function showToast(message, type) {
  const box = $("toasts");
  if (!box) return;
  const kind = type === "success" ? "success" : type === "error" ? "error" : "info";
  const mark = kind === "success" ? "✓" : kind === "error" ? "✕" : "ℹ";
  const el = document.createElement("div");
  el.className = "toast " + kind;
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = mark;
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  el.append(icon, text);
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 350);
  }, 4000);
}

/* ---------- navigation ---------- */
function setActiveTab(page) {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === page);
  });
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll(".app-page").forEach((el) => { el.style.display = "none"; });
  const target = $("page-" + page);
  if (target) target.style.display = "block";
  setActiveTab(page);
  if (page === "studio") initStudioPage();
  if (page === "voices") { initVoicesPage(); loadVoices(); }
  if (page === "clone") { initClonePage(); loadClonedList(); }
  if (page === "batch") { initBatchPage(); loadBatchVoices(); }
}

function showOnly(id) {
  document.querySelectorAll(".page").forEach((el) => { el.style.display = "none"; });
  const target = $(id);
  if (target) target.style.display = "block";
}

function showSetup() { showOnly("page-setup"); initSetupPage(); }
function showGate() { showOnly("page-gate"); initGatePage(); }

function showApp() {
  document.querySelectorAll(".page").forEach((el) => { el.style.display = "none"; });
  $("app-container").style.display = "block";
  initStudioPage();
  navigateTo("studio");
}

function appReady() {
  if (localStorage.getItem("vf_verified") === "true") { showApp(); return; }
  fetch("/api/verify")
    .then((r) => r.json())
    .then((data) => {
      if (data.verified) {
        localStorage.setItem("vf_verified", "true");
        showApp();
      } else {
        showGate();
      }
    })
    .catch(() => showGate());
}

/* ---------- setup screen ---------- */
function initSetupPage() {
  const bar = $("setupProgress");
  const statusEl = $("setupStatus");
  if (!bar || !statusEl || setupPollStarted) return;
  setupPollStarted = true;
  fetch("/api/setup-start", { method: "POST" }).catch(() => {});
  const poll = setInterval(async () => {
    try {
      const res = await fetch("/api/setup-status");
      const data = await res.json();
      if (data.progress >= 0) bar.style.width = data.progress + "%";
      statusEl.textContent = data.status || "Loading…";
      if (data.model_loaded) {
        clearInterval(poll);
        bar.style.width = "100%";
        statusEl.textContent = "Ready!";
        setTimeout(appReady, 800);
      } else if (data.progress === -1) {
        clearInterval(poll);
        statusEl.textContent = data.status || "Setup failed — check the server log.";
        statusEl.classList.add("error-text");
      }
    } catch (e) {
      statusEl.textContent = "Connecting to server…";
    }
  }, 1500);
}

/* ---------- community gate ---------- */
function initGatePage() {
  const page = $("page-gate");
  if (!page || page.dataset.initialized) return;
  page.dataset.initialized = "true";
  const stepFb = $("gateStep1");
  const stepWa = $("gateStep2");
  const unlockBtn = $("btnUnlock");
  const skipBtn = $("btnSkip");
  const fbLink = $("fbLink");
  const waLink = $("waLink");
  if (!stepFb || !stepWa || !unlockBtn || !fbLink || !waLink) return;
  let fbDone = false;
  let waDone = false;
  const checkReady = () => { unlockBtn.disabled = !(fbDone && waDone); };
  const verifyAndEnter = async (btn, busyText) => {
    if (btn) { btn.textContent = busyText; btn.disabled = true; }
    try {
      await fetch("/api/verify", { method: "POST" });
      localStorage.setItem("vf_verified", "true");
      showToast("Welcome to VoiceForge 2762!", "success");
      setTimeout(showApp, 500);
    } catch (e) {
      localStorage.setItem("vf_verified", "true");
      showApp();
    }
  };
  fbLink.addEventListener("click", () => {
    setTimeout(() => { fbDone = true; stepFb.classList.add("done"); checkReady(); }, 2000);
  });
  waLink.addEventListener("click", () => {
    setTimeout(() => { waDone = true; stepWa.classList.add("done"); checkReady(); }, 2000);
  });
  unlockBtn.addEventListener("click", async () => {
    if (!fbDone || !waDone) return;
    await verifyAndEnter(unlockBtn, "Opening VoiceForge 2762…");
  });
  if (skipBtn) {
    skipBtn.addEventListener("click", async () => {
      await verifyAndEnter(skipBtn, "Opening VoiceForge 2762…");
    });
  }
}

/* ---------- shared helpers ---------- */
function avatarColor(name) {
  const palette = ["#0e7490", "#b45309", "#be185d", "#4d7c0f",
                   "#1d4ed8", "#7c3aed", "#0f766e", "#c2410c"];
  const s = name || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function setStatusText(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

async function fetchVoices(search) {
  const url = "/api/voices" + (search ? "?search=" + encodeURIComponent(search) : "");
  const res = await fetch(url);
  const data = await res.json();
  return data.voices || [];
}

/* ---------- studio ---------- */
let studioPlayer = null;

function initStudioPage() {
  const host = $("studioContent");
  const page = $("page-studio");
  if (!host || !page || page.dataset.initialized) return;
  page.dataset.initialized = "true";
  host.innerHTML =
    '<div class="studio-grid">' +
    '  <section class="panel studio-main">' +
    '    <h2>Text to Speech</h2>' +
    '    <div class="text-area-wrap">' +
    '      <textarea id="ttsText" maxlength="50000" placeholder="Type or paste text to turn it into speech…"></textarea>' +
    '      <span class="char-count"><span id="charCount">0</span> / 50,000</span>' +
    '    </div>' +
    '    <div class="controls-row">' +
    '      <div class="control-group"><label for="ttsLang">Language</label>' +
    '        <select id="ttsLang"><option value="en">English</option></select></div>' +
    '      <div class="control-group"><label for="ttsSpeed">Speed <span id="speedVal">1.0x</span></label>' +
    '        <input id="ttsSpeed" type="range" min="0.5" max="2" step="0.1" value="1"></div>' +
    '      <div class="control-group"><label for="ttsPitch">Pitch <span id="pitchVal">1.0x</span></label>' +
    '        <input id="ttsPitch" type="range" min="0.5" max="2" step="0.1" value="1"></div>' +
    '      <div class="control-group"><label for="ttsReverb">Reverb <span id="reverbVal">0%</span></label>' +
    '        <input id="ttsReverb" type="range" min="0" max="1" step="0.1" value="0"></div>' +
    '    </div>' +
    '    <div class="controls-row">' +
    '      <div class="control-group"><label for="ttsBgm">Background music</label>' +
    '        <select id="ttsBgm"><option value="">None</option></select>' +
    '        <button id="btnUploadBgm" type="button" class="btn">Upload</button>' +
    '        <input type="file" id="bgmFileInput" accept="audio/*" hidden></div>' +
    '      <div class="control-group"><label for="ttsFormat">Output format</label>' +
    '        <select id="ttsFormat"><option value="wav">WAV</option><option value="mp3">MP3</option></select></div>' +
    '    </div>' +
    '    <button id="btnGenerate" type="button" class="btn-generate">Generate Speech</button>' +
    '    <div id="resultSection" hidden><h3>Generated audio</h3>' +
    '      <div id="studioPlayer"><audio id="studioAudio" controls style="width:100%"></audio>' +
    '      <a id="studioDownload" class="btn" download>⬇️ Download</a></div></div>' +
    '  </section>' +
    '  <aside class="panel studio-sidebar">' +
    '    <h3>Selected voice</h3>' +
    '    <button id="voiceSelector" type="button" class="voice-selector">' +
    '      <span id="selAvatar" class="sel-avatar">A</span>' +
    '      <span class="sel-text"><strong id="selName">Alba</strong>' +
    '      <span id="selDesc">Clear, versatile female voice</span></span>' +
    '      <span class="sel-arrow">›</span>' +
    '    </button>' +
    '    <h3>Recent generations</h3>' +
    '    <div id="historyList" class="history-list"><p>No generations yet.</p></div>' +
    '    <a href="/api/history/download-all">Download history (ZIP)</a>' +
    '  </aside>' +
    '</div>';

  $("ttsText").addEventListener("input", (e) => {
    $("charCount").textContent = e.target.value.length.toLocaleString("en-US");
  });
  const bindRange = (inputId, outId, fmt) => {
    $(inputId).addEventListener("input", (e) => { $(outId).textContent = fmt(e.target.value); });
  };
  bindRange("ttsSpeed", "speedVal", (v) => Number(v).toFixed(1) + "x");
  bindRange("ttsPitch", "pitchVal", (v) => Number(v).toFixed(1) + "x");
  bindRange("ttsReverb", "reverbVal", (v) => Math.round(Number(v) * 100) + "%");
  $("btnGenerate").addEventListener("click", generateSpeech);
  $("voiceSelector").addEventListener("click", () => navigateTo("voices"));
  $("btnUploadBgm").addEventListener("click", () => $("bgmFileInput").click());
  $("bgmFileInput").addEventListener("change", uploadBgm);
  studioPlayer = $("studioAudio");
  updateVoiceSelector();
  loadHistory();
  loadBgmList();
}

function updateVoiceSelector() {
  const avatar = $("selAvatar");
  if (!avatar) return;
  avatar.textContent = (studioVoice.name || "?")[0].toUpperCase();
  avatar.style.background = avatarColor(studioVoice.name);
  $("selName").textContent = studioVoice.name;
  $("selDesc").textContent = studioVoice.description || studioVoice.gender || "AI voice";
}

function selectVoice(voice) {
  studioVoice = voice;
  updateVoiceSelector();
  navigateTo("studio");
  showToast("Selected " + voice.name, "success");
}

async function loadBgmList() {
  const sel = $("ttsBgm");
  if (!sel) return;
  try {
    const res = await fetch("/api/bgm");
    if (!res.ok) return;
    const data = await res.json();
    sel.innerHTML = '<option value="">None</option>' +
      (data.bgm_files || []).map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("");
  } catch (e) { /* leave the list as-is */ }
}

async function uploadBgm() {
  const input = $("bgmFileInput");
  if (!input || !input.files[0]) return;
  const fd = new FormData();
  fd.append("audio", input.files[0]);
  try {
    const res = await fetch("/api/bgm/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
    showToast("Background music uploaded.", "success");
    loadBgmList();
  } catch (e) {
    showToast(e.message || "Upload failed.", "error");
  } finally {
    input.value = "";
  }
}

async function loadHistory() {
  const list = $("historyList");
  if (!list) return;
  try {
    const res = await fetch("/api/history");
    if (!res.ok) return;
    const data = await res.json();
    const items = (data.history || []).slice(0, 10);
    list.textContent = "";
    if (!items.length) { list.textContent = "No generations yet."; return; }
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.textContent = (item.text || "Speech") + " · " +
        new Date(item.timestamp * 1000).toLocaleTimeString();
      list.appendChild(row);
    });
  } catch (e) { /* leave the sidebar as-is */ }
}

async function generateSpeech() {
  const text = $("ttsText").value.trim();
  if (!text) { showToast("Enter some text first.", "error"); return; }
  const btn = $("btnGenerate");
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice_id: studioVoice.id,
        speed: Number($("ttsSpeed").value),
        language: $("ttsLang").value,
        pitch: Number($("ttsPitch").value),
        reverb: Number($("ttsReverb").value),
        bgm_file: $("ttsBgm").value || null,
        output_format: $("ttsFormat").value,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Speech generation failed");
    }
    const blob = await res.blob();
    const format = $("ttsFormat").value;
    const fileId = res.headers.get("X-File-Id") || "voiceforge2762-audio";
    const url = URL.createObjectURL(blob);
    $("resultSection").hidden = false;
    studioPlayer.src = url;
    const dl = $("studioDownload");
    dl.href = url;
    dl.download = fileId + "." + format;
    showToast("Speech generated.", "success");
    loadHistory();
  } catch (e) {
    showToast(e.message || "Speech generation failed.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Speech";
  }
}

/* ---------- voices ---------- */
function initVoicesPage() {
  const page = $("page-voices");
  if (!page || page.dataset.initialized) return;
  page.dataset.initialized = "true";
  page.innerHTML =
    '<div class="panel"><h2>Voice Library</h2>' +
    '<input id="voiceSearch" type="search" placeholder="Search voices…" aria-label="Search voices">' +
    '<div id="voicesGrid" class="voices-grid"></div></div>';
  $("voiceSearch").addEventListener("input", loadVoices);
}

function createVoiceCard(voice) {
  const card = document.createElement("article");
  card.className = "voice-card";
  const avatar = document.createElement("span");
  avatar.className = "voice-avatar";
  avatar.textContent = (voice.name || "?")[0].toUpperCase();
  avatar.style.background = avatarColor(voice.name);
  const title = document.createElement("h3");
  title.textContent = voice.name + (voice.is_cloned ? " 🧬" : "");
  const desc = document.createElement("p");
  desc.textContent = voice.description || "AI voice";
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.textContent = "▶ Preview";
  previewBtn.addEventListener("click", () => previewVoice(voice));
  const useBtn = document.createElement("button");
  useBtn.type = "button";
  useBtn.textContent = "Use Voice";
  useBtn.addEventListener("click", () => selectVoice(voice));
  card.append(avatar, title, desc, previewBtn, useBtn);
  return card;
}

async function loadVoices() {
  const grid = $("voicesGrid");
  if (!grid) return;
  const query = ($("voiceSearch") && $("voiceSearch").value) || "";
  try {
    voicesCache = await fetchVoices(query.trim());
    grid.textContent = "";
    if (!voicesCache.length) {
      grid.textContent = "No voices match.";
      return;
    }
    voicesCache.forEach((voice) => grid.appendChild(createVoiceCard(voice)));
  } catch (e) {
    showToast("Could not load voices.", "error");
  }
}

async function previewVoice(voice) {
  try {
    const res = await fetch("/api/preview/" + encodeURIComponent(voice.id));
    if (!res.ok) throw new Error("Preview failed");
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.play().catch(() => showToast("Preview failed — model may still be loading.", "error"));
  } catch (e) {
    showToast(e.message || "Preview failed.", "error");
  }
}

/* ---------- clone ---------- */
function initClonePage() {
  const page = $("page-clone");
  if (!page || page.dataset.initialized) return;
  page.dataset.initialized = "true";
  page.innerHTML =
    '<div class="clone-grid">' +
    '  <section class="panel">' +
    '    <h2>Voice Cloning</h2>' +
    '    <p>Use reference audio only when you own it or have permission from the speaker. Background noise is cleaned automatically.</p>' +
    '    <form id="cloneForm">' +
    '      <label for="cloneName">Voice name</label>' +
    '      <input id="cloneName" name="name" type="text" required maxlength="60" placeholder="e.g. My Deep Voice">' +
    '      <label for="cloneLanguage">Language</label>' +
    '      <select id="cloneLanguage" name="language"><option value="en">English</option></select>' +
    '      <label for="cloneAudio">Reference audio</label>' +
    '      <input id="cloneAudio" name="audio" type="file" accept="audio/*" required>' +
    '      <button type="submit" class="btn-clone">Create voice profile</button>' +
    '    </form>' +
    '    <p id="cloneStatus" role="status"></p>' +
    '    <h3>Your cloned voices</h3>' +
    '    <div id="clonedList" class="voices-grid"></div>' +
    '  </section>' +
    '  <section class="panel">' +
    '    <h2>Model access</h2>' +
    '    <p>Voice cloning needs a Hugging Face token with the Pocket TTS model terms accepted. Enter it here — it stays on this server only.</p>' +
    '    <label for="hfToken">Hugging Face token</label>' +
    '    <input id="hfToken" type="password" autocomplete="off" placeholder="hf_…">' +
    '    <button id="saveHfToken" type="button">Save token and check access</button>' +
    '    <button id="resetHfToken" type="button">Reset authentication</button>' +
    '    <p id="tokenStatus" role="status"></p>' +
    '  </section>' +
    '</div>';

  $("cloneForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const audioFile = $("cloneAudio").files[0];
    if (!audioFile) return;
    const fd = new FormData();
    fd.append("name", $("cloneName").value.trim());
    fd.append("language", $("cloneLanguage").value);
    fd.append("audio", audioFile);
    setStatusText("cloneStatus", "Processing reference audio…");
    try {
      const res = await fetch("/api/clone", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Voice cloning failed");
      setStatusText("cloneStatus", data.message || "Voice profile created.");
      showToast("Voice profile created.", "success");
      loadClonedList();
    } catch (e) {
      setStatusText("cloneStatus", e.message);
      showToast(e.message || "Voice cloning failed.", "error");
    }
  });

  $("saveHfToken").addEventListener("click", async () => {
    const token = $("hfToken").value.trim();
    if (!token) { setStatusText("tokenStatus", "Enter your token first."); return; }
    setStatusText("tokenStatus", "Checking model access…");
    try {
      const res = await fetch("/api/set-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");
      setStatusText("tokenStatus", data.message || "Model access updated.");
      $("hfToken").value = "";
      showToast("Model access updated.", "success");
    } catch (e) {
      setStatusText("tokenStatus", e.message);
      showToast(e.message || "Authentication failed.", "error");
    }
  });

  $("resetHfToken").addEventListener("click", async () => {
    setStatusText("tokenStatus", "Resetting authentication…");
    try {
      const res = await fetch("/api/reset-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Reset failed");
      setStatusText("tokenStatus", data.message || "Authentication reset.");
      showToast("Authentication reset.", "success");
    } catch (e) {
      setStatusText("tokenStatus", e.message);
      showToast(e.message || "Reset failed.", "error");
    }
  });
}

async function loadClonedList() {
  const list = $("clonedList");
  if (!list) return;
  try {
    const res = await fetch("/api/cloned-voices");
    const data = await res.json();
    const cloned = data.voices || [];
    list.textContent = "";
    if (!cloned.length) { list.textContent = "No cloned voices yet."; return; }
    cloned.forEach((voice) => {
      const card = document.createElement("article");
      card.className = "voice-card";
      const title = document.createElement("h3");
      title.textContent = voice.name + " 🧬";
      const desc = document.createElement("p");
      desc.textContent = voice.description || "Cloned voice";
      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.textContent = "Use Voice";
      useBtn.addEventListener("click", () => selectVoice(voice));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "🗑️ Delete";
      delBtn.addEventListener("click", () => deleteCloned(voice.id));
      card.append(title, desc, useBtn, delBtn);
      list.appendChild(card);
    });
  } catch (e) { /* leave the list as-is */ }
}

async function deleteCloned(id) {
  if (!window.confirm("Delete this cloned voice?")) return;
  await fetch("/api/cloned-voices/" + encodeURIComponent(id), { method: "DELETE" });
  loadClonedList();
}

/* ---------- batch ---------- */
function initBatchPage() {
  const page = $("page-batch");
  if (!page || page.dataset.initialized) return;
  page.dataset.initialized = "true";
  page.innerHTML =
    '<h2>Batch Generation</h2>' +
    '<p>Generate speech for multiple text lines and download the audio files as a ZIP archive.</p>' +
    '<div class="studio-grid">' +
    '  <div class="panel">' +
    '    <label for="batchText">Text input, one line per audio file</label>' +
    '    <textarea id="batchText" rows="14" maxlength="100000" placeholder="First line of speech\nSecond line of speech"></textarea>' +
    '  </div>' +
    '  <div class="panel">' +
    '    <label for="batchVoice">Voice</label><select id="batchVoice"></select>' +
    '    <label for="batchLang">Language</label><select id="batchLang"><option value="en">English</option></select>' +
    '    <label for="batchFormat">Output format</label><select id="batchFormat"><option value="wav">WAV</option><option value="mp3">MP3</option></select>' +
    '    <label for="batchSpeed">Speed <span id="batchSpeedVal">1.0x</span></label>' +
    '    <input type="range" id="batchSpeed" min="0.5" max="2" step="0.1" value="1">' +
    '    <label for="batchPitch">Pitch <span id="batchPitchVal">1.0x</span></label>' +
    '    <input type="range" id="batchPitch" min="0.5" max="2" step="0.1" value="1">' +
    '    <label for="batchReverb">Reverb <span id="batchReverbVal">0%</span></label>' +
    '    <input type="range" id="batchReverb" min="0" max="1" step="0.1" value="0">' +
    '    <button id="btnBatchGenerate" type="button">Generate Batch (ZIP)</button>' +
    '  </div>' +
    '</div>';
  const bindRange = (inputId, outId, fmt) => {
    $(inputId).addEventListener("input", (e) => { $(outId).textContent = fmt(e.target.value); });
  };
  bindRange("batchSpeed", "batchSpeedVal", (v) => Number(v).toFixed(1) + "x");
  bindRange("batchPitch", "batchPitchVal", (v) => Number(v).toFixed(1) + "x");
  bindRange("batchReverb", "batchReverbVal", (v) => Math.round(Number(v) * 100) + "%");
  $("btnBatchGenerate").addEventListener("click", runBatch);
}

async function loadBatchVoices() {
  const select = $("batchVoice");
  if (!select) return;
  try {
    const voices = await fetchVoices("");
    select.textContent = "";
    voices.forEach((v) => {
      const option = document.createElement("option");
      option.value = v.id;
      option.textContent = v.name + (v.is_cloned ? " (Cloned)" : "");
      select.appendChild(option);
    });
    select.value = "alba";
  } catch (e) {
    showToast("Could not load voices.", "error");
  }
}

async function runBatch() {
  const lines = $("batchText").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) { showToast("Enter text before generating.", "error"); return; }
  if (lines.length > 100) { showToast("Maximum 100 lines per batch.", "error"); return; }
  const btn = $("btnBatchGenerate");
  btn.disabled = true;
  btn.textContent = "Generating batch…";
  try {
    const res = await fetch("/api/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texts: lines,
        voice_id: $("batchVoice").value,
        language: $("batchLang").value,
        output_format: $("batchFormat").value,
        speed: Number($("batchSpeed").value),
        pitch: Number($("batchPitch").value),
        reverb: Number($("batchReverb").value),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || ("Batch failed (HTTP " + res.status + ")"));
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "VoiceForge2762_Batch.zip";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Batch generated.", "success");
  } catch (e) {
    showToast(e.message || "Batch generation failed.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Batch (ZIP)";
  }
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => navigateTo(tab.dataset.page));
  });
  fetch("/api/health")
    .then((r) => r.json())
    .then((data) => {
      if (data.model_loaded) appReady();
      else showSetup();
    })
    .catch(() => showSetup());
});
