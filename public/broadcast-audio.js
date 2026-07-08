/** 機長廣播：captain.mp3 前段 → OpenAI TTS（失敗則瀏覽器 TTS） */
let audioCtx = null;
let currentAudio = null;
let flightSfxAudio = null;
let landingAudio = null;
let landingVolume = 0.3;

const CAPTAIN_SFX = {
  url: 'media/captain.mp3',
  seconds: 7,
  volume: 0.72,
};

const TAKEOFF_SFX_URL = 'media/takeoff.mp3';

/** 儀式音景交叉淡入淡出（wakeup ↔ captain ↔ TTS） */
const CEREMONY_FADE = {
  bedOut: 800,
  bedRestore: 1400,
  captainIn: 520,
  captainOut: 480,
  speechIn: 450,
  sfxHandoff: 900,
};

/** 極短無聲 WAV：解鎖 HTML Audio 自動播放，不可聽見（勿用 captain.mp3 loop） */
const SILENT_KEEPALIVE =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

async function ensureAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch { /* noop */ }
  }
  return audioCtx;
}

function tone(freq, startSec, durSec, volume = 0.12) {
  const ctx = audioCtx;
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startSec;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durSec);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopPlayback() {
  stopCeremonyWebAudio();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function clampVolume(v) {
  return Math.min(1, Math.max(0, v));
}

function fadeAudioVolume(audio, from, to, ms) {
  return new Promise((resolve) => {
    if (!audio || ms <= 0) {
      if (audio) audio.volume = clampVolume(to);
      resolve();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      // rAF 的幀時間戳可能早於註冊時的 performance.now()，p 會變負 → 音量負值會 throw
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      try {
        audio.volume = clampVolume(from + (to - from) * p);
      } catch { /* 元素可能已被釋放 */ }
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function playAudioElement(audio) {
  try {
    await audio.play();
    return true;
  } catch {
    await unlockMedia();
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }
}

const bufferCache = new Map();
const activePlaybacks = new WeakMap();
let flightSfxNode = null;
let captainIntroNode = null;
let speechNode = null;

function preloadCeremonyMp3Buffers() {
  void loadAudioBuffer(CAPTAIN_SFX.url).catch(() => { });
  void loadAudioBuffer(TAKEOFF_SFX_URL).catch(() => { });
}

async function loadAudioBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch ${res.status}`);
  const ctx = await ensureAudioCtx();
  if (!ctx) throw new Error('no audio ctx');
  const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
  bufferCache.set(url, buffer);
  return buffer;
}

async function decodeBlobToBuffer(blob) {
  const ctx = await ensureAudioCtx();
  if (!ctx || !blob) return null;
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

function stopCeremonyWebAudio(tag) {
  const stopNode = (node, clear) => {
    if (!node) return;
    const finish = activePlaybacks.get(node);
    if (finish) finish(true);
    else {
      try { node.source.stop(); } catch { /* noop */ }
      try { node.source.disconnect(); } catch { /* noop */ }
      try { node.gain.disconnect(); } catch { /* noop */ }
    }
    clear();
  };
  if (!tag || tag === 'flightSfx') {
    stopNode(flightSfxNode, () => { flightSfxNode = null; });
  }
  if (!tag || tag === 'captain') {
    stopNode(captainIntroNode, () => { captainIntroNode = null; });
  }
  if (!tag || tag === 'speech') {
    stopNode(speechNode, () => { speechNode = null; });
  }
}

function stopCaptainIntro() {
  stopCeremonyWebAudio('captain');
}

function detachCeremonyNode(node, tag) {
  if (tag === 'flightSfx' && flightSfxNode === node) flightSfxNode = null;
  if (tag === 'captain' && captainIntroNode === node) captainIntroNode = null;
  if (tag === 'speech' && speechNode === node) speechNode = null;
}

/** 與塔台 bibibi 相同引擎：Web Audio 播 MP3（iOS 在 API 等待後仍可用） */
async function playWebAudioBuffer(buffer, {
  volume = 1,
  loop = false,
  maxSeconds = 0,
  fadeInMs = 0,
  fadeOutMs = 0,
  tag = 'speech',
} = {}) {
  const ctx = await ensureAudioCtx();
  if (!ctx || !buffer) return false;

  if (tag === 'flightSfx') stopCeremonyWebAudio('flightSfx');
  else if (tag === 'captain') stopCeremonyWebAudio('captain');
  else stopCeremonyWebAudio('speech');

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = !!(loop && maxSeconds <= 0);
  const bufDur = Number.isFinite(buffer.duration) && buffer.duration > 0 ? buffer.duration : 0;
  const clipSec = maxSeconds > 0 && bufDur > 0 ? Math.min(maxSeconds, bufDur) : (maxSeconds > 0 ? maxSeconds : 0);
  const gain = ctx.createGain();
  const targetVol = Math.max(volume, 0.0001);
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(fadeInMs > 0 ? 0.0001 : targetVol, t0);
  source.connect(gain);
  gain.connect(ctx.destination);

  const node = { source, gain, tag };
  if (tag === 'flightSfx') flightSfxNode = node;
  else if (tag === 'captain') captainIntroNode = node;
  else speechNode = node;

  const stopSource = () => {
    try { source.stop(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
    try { gain.disconnect(); } catch { /* noop */ }
  };

  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      activePlaybacks.delete(node);
      if (timer) clearTimeout(timer);
      stopSource();
      detachCeremonyNode(node, tag);
      resolve(ok);
    };
    activePlaybacks.set(node, finish);
    source.onended = () => { if (!source.loop) finish(true); };
    const timerMs = clipSec > 0
      ? clipSec * 1000 + 250
      : loop ? 0 : Math.min(120000, buffer.duration * 1000 + 800);
    if (timerMs > 0) timer = setTimeout(() => finish(true), timerMs);
    try {
      if (clipSec > 0) source.start(0, 0, clipSec);
      else source.start(0);
      if (fadeInMs > 0) {
        gain.gain.exponentialRampToValueAtTime(targetVol, t0 + fadeInMs / 1000);
      }
      if (fadeOutMs > 0 && clipSec > fadeOutMs / 1000 + 0.08) {
        const fadeOutStart = t0 + clipSec - fadeOutMs / 1000;
        gain.gain.setValueAtTime(targetVol, fadeOutStart);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + clipSec);
      }
      // Looping ambience/SFX should keep playing until stopCeremonyWebAudio/stopFlightSfx is called.
      if (loop) resolve(true);
    } catch {
      finish(false);
    }
  });
}

async function playMp3Url(url, opts = {}) {
  const buffer = await loadAudioBuffer(url).catch(() => null);
  if (!buffer) return false;
  return playWebAudioBuffer(buffer, opts);
}

async function playMp3Blob(blob, opts = {}) {
  const buffer = await decodeBlobToBuffer(blob).catch(() => null);
  if (!buffer) return false;
  return playWebAudioBuffer(buffer, opts);
}

async function playTimedClip(url, { seconds = 0, volume = 1, loop = false, fadeInMs = 0, fadeOutMs = 0 } = {}) {
  if (!url) return false;
  await ensureAudioCtx();
  if (await playMp3Url(url, {
    volume,
    loop: false,
    maxSeconds: seconds > 0 ? seconds : 0,
    fadeInMs,
    fadeOutMs,
    tag: 'captain',
  })) return true;

  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.volume = volume;
    audio.loop = false;
    markInlineAudio(audio);
    currentAudio = audio;
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      audio.removeEventListener('timeupdate', onCap);
      if (currentAudio === audio) currentAudio = null;
      try { audio.pause(); } catch { /* noop */ }
      resolve(ok);
    };
    const onCap = () => {
      if (seconds > 0 && audio.currentTime >= seconds - 0.05) finish(true);
    };
    if (seconds > 0) {
      timer = setTimeout(() => finish(true), seconds * 1000 + 120);
      audio.addEventListener('timeupdate', onCap);
    }
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    playAudioElement(audio).then((ok) => { if (!ok) finish(false); });
  });
}

async function playTowerSignal() {
  await playAttentionBeeps();
  await playPaChime();
}

let towerSignalActive = false;
let towerSignalTimer = null;

/** 塔台連線等待期：週期播放 bibibibi + PA 叮，直到 stopTowerSignalLoop */
function startTowerSignalLoop(intervalMs = 5200) {
  stopTowerSignalLoop();
  towerSignalActive = true;
  const tick = async () => {
    if (!towerSignalActive) return;
    await playTowerSignal();
    if (towerSignalActive) {
      towerSignalTimer = setTimeout(tick, intervalMs);
    }
  };
  tick();
}

function stopTowerSignalLoop() {
  towerSignalActive = false;
  if (towerSignalTimer) {
    clearTimeout(towerSignalTimer);
    towerSignalTimer = null;
  }
}

async function playCaptainIntro({ fadeInMs = CEREMONY_FADE.captainIn, fadeOutMs = CEREMONY_FADE.captainOut } = {}) {
  stopCaptainIntro();
  resetKeepAliveToSilent();
  await ensureAudioCtx();
  const cfg = { ...CAPTAIN_SFX, ...window.SLEEP_AIRLINE_CAPTAIN_SFX };
  if (!cfg.url) return false;
  const sec = Math.max(0.5, Math.min(30, Number(cfg.seconds) || 7));
  await Promise.race([
    playTimedClip(cfg.url, {
      seconds: sec,
      volume: cfg.volume ?? 0.72,
      loop: false,
      fadeInMs,
      fadeOutMs,
    }),
    delay(sec * 1000 + fadeOutMs + 180),
  ]);
  stopCaptainIntro();
  return true;
}

async function playFlightSfx(url, { loop = true, volume = 0.65, fadeInMs = 700 } = {}) {
  stopFlightSfx({ fade: false });
  if (!url) return false;
  await ensureAudioCtx();
  if (await playMp3Url(url, {
    volume,
    loop,
    fadeInMs,
    tag: 'flightSfx',
  })) return true;

  await unlockMedia();
  const audio = new Audio(url);
  audio.loop = loop;
  audio.volume = 0;
  markInlineAudio(audio);
  flightSfxAudio = audio;
  audio.onerror = () => { if (flightSfxAudio === audio) flightSfxAudio = null; };
  try {
    await Promise.race([audio.play(), delay(1200)]);
    await fadeAudioVolume(audio, 0, volume, fadeInMs);
    return true;
  } catch {
    flightSfxAudio = null;
    return false;
  }
}

async function stopFlightSfx({ fade = true, ms = 550 } = {}) {
  if (flightSfxNode) {
    const { source, gain } = flightSfxNode;
    if (fade && gain && audioCtx) {
      try {
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
        await delay(ms);
      } catch { /* noop */ }
    }
    try { source.stop(); } catch { /* noop */ }
    flightSfxNode = null;
  }
  if (!flightSfxAudio) return;
  const audio = flightSfxAudio;
  const vol = audio.volume;
  flightSfxAudio = null;
  if (fade && vol > 0) await fadeAudioVolume(audio, vol, 0, ms);
  audio.pause();
  try { audio.currentTime = 0; } catch { /* noop */ }
  audio.src = '';
}

async function playLandingMusic(url, opts = {}) {
  if (!url) return false;
  await stopLandingMusic({ fade: false });
  await unlockMedia();
  landingVolume = typeof opts.volume === 'number' ? opts.volume : 0.3;
  const audio = new Audio(url);
  audio.loop = opts.loop !== false;
  audio.volume = 0;
  audio.playsInline = true;
  audio.preload = 'auto';
  landingAudio = audio;
  audio.onerror = () => { if (landingAudio === audio) landingAudio = null; };
  const ok = await playAudioElement(audio);
  if (!ok) {
    if (landingAudio === audio) landingAudio = null;
    return false;
  }
  // 維持 keepalive，避免 iOS 在長 API 等待後無法播 TTS
  await fadeAudioVolume(audio, 0, landingVolume, opts.fadeInMs ?? 1600);
  return true;
}

let landingFadeOutPromise = null;

async function stopLandingMusic({ fade = true, ms = 900 } = {}) {
  landingFadeOutPromise = null;
  const audio = landingAudio;
  if (!audio) return;
  landingAudio = null;
  const vol = audio.volume;
  if (fade && vol > 0.001) await fadeAudioVolume(audio, vol, 0, ms);
  audio.pause();
  try { audio.currentTime = 0; } catch { /* noop */ }
  audio.src = '';
}

/** landing.mp4 播完：takeoff 漸弱 ↔ wakeup 漸強 */
async function resumeLandingMusicAfterApproach({ fadeInMs = CEREMONY_FADE.bedRestore } = {}) {
  landingPausedForCaptain = false;
  if (!landingAudio) return false;
  await unlockMedia();
  try {
    if (landingAudio.paused) {
      landingAudio.volume = 0;
      await Promise.race([landingAudio.play(), delay(900)]);
    }
    await fadeAudioVolume(landingAudio, landingAudio.volume, landingVolume, fadeInMs);
    return true;
  } catch {
    return false;
  }
}

/** 抵達面板出現時：wakeup 漸弱至停止 */
async function fadeOutLandingMusic({ ms = 3200 } = {}) {
  const audio = landingAudio;
  if (!audio) return;
  if (landingFadeOutPromise) return landingFadeOutPromise;
  landingFadeOutPromise = (async () => {
    const vol = audio.volume;
    await fadeAudioVolume(audio, vol, 0, ms);
    if (landingAudio === audio) {
      landingAudio = null;
      audio.pause();
      try { audio.currentTime = 0; } catch { /* noop */ }
      audio.src = '';
    }
    landingFadeOutPromise = null;
  })();
  return landingFadeOutPromise;
}

let savedFlightSfxVolume = null;
let landingPausedForCaptain = false;

/** 機長廣播前：wakeup 漸弱至靜音（給 captain 讓路） */
async function fadeCeremonyBedOut(ms = CEREMONY_FADE.bedOut) {
  const jobs = [];
  if (landingAudio && landingAudio.volume > 0.001) {
    jobs.push(
      fadeAudioVolume(landingAudio, landingAudio.volume, 0, ms).then(() => {
        if (landingAudio && !landingAudio.paused) {
          landingPausedForCaptain = true;
          landingAudio.pause();
        }
      }),
    );
  } else if (landingAudio && !landingAudio.paused) {
    landingPausedForCaptain = true;
    landingAudio.pause();
  }
  if (flightSfxAudio && flightSfxAudio.volume > 0.001) {
    if (savedFlightSfxVolume == null) savedFlightSfxVolume = flightSfxAudio.volume;
    jobs.push(fadeAudioVolume(flightSfxAudio, flightSfxAudio.volume, 0, ms));
  }
  if (jobs.length) await Promise.all(jobs);
}

async function duckCeremonyBed() {
  const jobs = [];
  if (landingAudio) {
    const target = Math.min(landingVolume * 0.03, 0.01);
    jobs.push(fadeAudioVolume(landingAudio, landingAudio.volume, target, 600));
  }
  if (flightSfxAudio) {
    savedFlightSfxVolume = flightSfxAudio.volume;
    jobs.push(fadeAudioVolume(
      flightSfxAudio,
      flightSfxAudio.volume,
      Math.min(savedFlightSfxVolume * 0.05, 0.012),
      600,
    ));
  }
  if (jobs.length) await Promise.all(jobs);
}

/** 機長 TTS 期間：甦醒音景完全靜音，凸顯人聲 */
async function muteCeremonyBedForSpeech() {
  if (landingAudio && landingAudio.volume <= 0.001 && landingPausedForCaptain) return;
  const ms = 600;
  const jobs = [];
  if (landingAudio && landingAudio.volume > 0.001) {
    jobs.push(fadeAudioVolume(landingAudio, landingAudio.volume, 0, ms));
  }
  if (flightSfxAudio && flightSfxAudio.volume > 0.001) {
    if (savedFlightSfxVolume == null) savedFlightSfxVolume = flightSfxAudio.volume;
    jobs.push(fadeAudioVolume(flightSfxAudio, flightSfxAudio.volume, 0, ms));
  }
  if (jobs.length) await Promise.all(jobs);
  if (landingAudio && !landingAudio.paused) {
    landingPausedForCaptain = true;
    landingAudio.pause();
  }
}

async function restoreCeremonyBed({ fadeMs = CEREMONY_FADE.bedRestore } = {}) {
  const jobs = [];
  if (landingAudio) {
    if (landingPausedForCaptain || landingAudio.paused) {
      landingPausedForCaptain = false;
      try {
        landingAudio.volume = 0;
        await Promise.race([landingAudio.play(), delay(900)]);
      } catch { /* noop */ }
    }
    jobs.push(fadeAudioVolume(landingAudio, landingAudio.volume, landingVolume, fadeMs));
  }
  if (flightSfxAudio && savedFlightSfxVolume != null) {
    jobs.push(fadeAudioVolume(flightSfxAudio, flightSfxAudio.volume, savedFlightSfxVolume, fadeMs));
    savedFlightSfxVolume = null;
  }
  if (jobs.length) await Promise.all(jobs);
}

function duckLandingMusic() {
  void duckCeremonyBed();
}

function restoreLandingMusic() {
  void restoreCeremonyBed();
}

let mediaUnlocked = false;
let keepAliveAudio = null;

function markInlineAudio(audio) {
  if (!audio) return;
  audio.playsInline = true;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
}

/** 同步建立／喚醒 AudioContext（須在 click 堆疊內呼叫） */
function primeAudioContextSync() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') {
    try { void audioCtx.resume(); } catch { /* noop */ }
  }
}

function ensureKeepAliveElement() {
  if (keepAliveAudio) return keepAliveAudio;
  keepAliveAudio = document.getElementById('ceremony-keepalive');
  if (!keepAliveAudio) {
    keepAliveAudio = document.createElement('audio');
    keepAliveAudio.id = 'ceremony-keepalive';
    keepAliveAudio.loop = true;
    keepAliveAudio.preload = 'auto';
    keepAliveAudio.style.display = 'none';
    markInlineAudio(keepAliveAudio);
    document.body.appendChild(keepAliveAudio);
  }
  return keepAliveAudio;
}

function tryPlayKeepAlive(audio, src) {
  if (src && audio.dataset.src !== src) {
    audio.src = src;
    audio.dataset.src = src;
    audio.load();
  }
  audio.loop = true;
  audio.volume = 0.001;
  markInlineAudio(audio);
  return audio.play();
}

function resetKeepAliveToSilent() {
  const audio = keepAliveAudio || document.getElementById('ceremony-keepalive');
  if (!audio) return;
  if (audio.dataset.src === CAPTAIN_SFX.url || audio.dataset.src === TAKEOFF_SFX_URL) {
    try { audio.pause(); } catch { /* noop */ }
    tryPlayKeepAlive(audio, SILENT_KEEPALIVE);
  }
}

/** 必須同步呼叫（click / touch 當下，不可 await）— iOS 才允許後續 captain / TTS / takeoff.mp3 */
function primeFromUserGesture() {
  primeAudioContextSync();
  preloadCeremonyMp3Buffers();
  const audio = ensureKeepAliveElement();
  if (!audio.paused && audio.currentTime > 0) {
    mediaUnlocked = true;
    return true;
  }
  let playPromise;
  try {
    playPromise = tryPlayKeepAlive(audio, SILENT_KEEPALIVE);
  } catch {
    playPromise = null;
  }
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise.then(() => { mediaUnlocked = true; }).catch(() => { /* silent keepalive only */ });
    mediaUnlocked = true;
    return true;
  }
  try {
    tryPlayKeepAlive(audio, SILENT_KEEPALIVE);
    mediaUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

/** 儀式期間維持無聲 loop，避免 API 等待後 Audio / TTS 被瀏覽器擋住 */
async function startMediaKeepAlive() {
  primeFromUserGesture();
  const audio = keepAliveAudio || ensureKeepAliveElement();
  if (audio && !audio.paused) return true;
  if (audio?.paused) {
    try {
      await tryPlayKeepAlive(audio, audio.dataset.src || SILENT_KEEPALIVE);
      mediaUnlocked = true;
      return true;
    } catch { /* recreate below */ }
  }
  await ensureAudioCtx();
  try {
    await tryPlayKeepAlive(ensureKeepAliveElement(), SILENT_KEEPALIVE);
    mediaUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

function stopMediaKeepAlive() {
  if (!keepAliveAudio) return;
  try { keepAliveAudio.pause(); } catch { /* noop */ }
  try { keepAliveAudio.currentTime = 0; } catch { /* noop */ }
}

/** 在使用者點擊當下解鎖 Audio / Video 自動播放（避免 API 等待後被瀏覽器擋住） */
async function unlockMedia() {
  primeFromUserGesture();
  await ensureAudioCtx();
  if (keepAliveAudio && !keepAliveAudio.paused) {
    mediaUnlocked = true;
    return true;
  }
  if (await startMediaKeepAlive()) return true;
  try {
    const probe = new Audio(SILENT_KEEPALIVE);
    probe.volume = 0.001;
    probe.preload = 'auto';
    markInlineAudio(probe);
    await probe.play();
    probe.pause();
    try { probe.currentTime = 0; } catch { /* noop */ }
    mediaUnlocked = true;
    return true;
  } catch {
    await ensureAudioCtx();
    tone(440, 0, 0.04, 0.001);
    return !!audioCtx;
  }
}

function releaseCeremonyMedia() {
  stopMediaKeepAlive();
  keepAliveAudio = null;
  const el = document.getElementById('ceremony-keepalive');
  if (el) {
    try { el.pause(); } catch { /* noop */ }
    el.removeAttribute('src');
    el.load();
  }
}

async function playAttentionBeeps() {
  await ensureAudioCtx();
  tone(520, 0, 0.08, 0.09);
  await delay(200);
  tone(520, 0, 0.08, 0.09);
  await delay(200);
  tone(520, 0, 0.08, 0.09);
  await delay(280);
}

async function playPaChime() {
  await ensureAudioCtx();
  tone(880, 0, 0.2, 0.13);
  tone(660, 0.24, 0.32, 0.13);
  await delay(620);
}

function pickZhVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'zh-TW')
    || voices.find((v) => v.lang.startsWith('zh-TW'))
    || voices.find((v) => v.lang.startsWith('zh'))
    || null
  );
}

function speakTextOnce(text) {
  return new Promise((resolve) => {
    if (!text?.trim() || !window.speechSynthesis) {
      resolve(false);
      return;
    }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    // This is only a safety net. Let speechSynthesis.onend drive normal completion,
    // otherwise landing/takeoff can advance and cancel the voice mid-sentence.
    const estMs = Math.min(180000, Math.max(45000, text.length * 650));
    const timer = setTimeout(() => finish(true), estMs);
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-TW';
    utter.rate = 0.9;
    utter.pitch = 0.95;
    const voice = pickZhVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => finish(true);
    utter.onerror = () => finish(false);
    speechSynthesis.speak(utter);
  });
}

async function speakText(text) {
  await unlockMedia();
  if (await speakTextOnce(text)) return true;
  await unlockMedia();
  return speakTextOnce(text);
}

async function fetchOpenAISpeechBlob(text, style) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch('/api/broadcast/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, style: style || 'formal_captain' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || !blob.type.startsWith('audio/')) return null;
    return blob;
  } catch {
    return null;
  }
}

function base64ToMp3Blob(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/mpeg' });
}

async function loadPreparedSpeechAudio(blob, text) {
  if (!blob?.size) return null;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = 'auto';
  markInlineAudio(audio);
  return { kind: 'openai', audio, url, blob, fallbackText: text };
}

/** 後端已生成語音時直接使用，省掉第二趟 /api/broadcast/speech */
async function prepareCaptainSpeechFromBase64(base64, text, style) {
  if (!base64) return prepareCaptainSpeech(text, style);
  try {
    const ready = await loadPreparedSpeechAudio(base64ToMp3Blob(base64), text);
    if (ready) return ready;
  } catch { /* fallback below */ }
  return prepareCaptainSpeech(text, style);
}

/** 先載入語音；OpenAI 失敗時標記可走瀏覽器 TTS。 */
async function prepareCaptainSpeech(text, style) {
  const blob = await fetchOpenAISpeechBlob(text, style);
  if (blob) {
    const ready = await loadPreparedSpeechAudio(blob, text);
    if (ready) return ready;
  }
  if (text?.trim() && window.speechSynthesis) return { kind: 'browser', text, fallbackText: text };
  return null;
}

async function playPreparedSpeech(prepared, { fadeInMs = CEREMONY_FADE.speechIn } = {}) {
  if (!prepared) return false;
  if (prepared.kind === 'browser') return speakText(prepared.text);
  stopCeremonyWebAudio('captain');
  await ensureAudioCtx();
  const blob = prepared.blob
    || (prepared.url ? await fetch(prepared.url).then((r) => r.blob()).catch(() => null) : null);
  if (blob) {
    const ok = await playMp3Blob(blob, { volume: 1, tag: 'speech', fadeInMs });
    if (ok) {
      if (prepared.url) URL.revokeObjectURL(prepared.url);
      return true;
    }
  }

  await unlockMedia();
  const { audio, url } = prepared;
  markInlineAudio(audio);
  audio.volume = 0;
  currentAudio = audio;
  const ok = await playAudioElement(audio);
  if (!ok) {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
    return speakText(prepared.fallbackText || '');
  }
  if (fadeInMs > 0) await fadeAudioVolume(audio, 0, 1, fadeInMs);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      audio.removeEventListener('timeupdate', onTime);
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve(ok);
    };
    const onTime = () => {
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0 && audio.currentTime >= d - 0.2) finish(true);
    };
    const textLen = prepared.fallbackText?.length || 0;
    const estMs = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.min(120000, audio.duration * 1000 + 2500)
      : Math.min(180000, Math.max(45000, textLen * 650));
    const timer = setTimeout(() => finish(true), estMs);
    audio.addEventListener('timeupdate', onTime);
    audio.onended = () => finish(true);
    audio.onerror = async () => {
      finish(await speakText(prepared.fallbackText || ''));
    };
  });
}

async function speakWithOpenAI(text, style) {
  const blob = await fetchOpenAISpeechBlob(text, style);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  return playPreparedSpeech({ kind: 'openai', audio: new Audio(url), url });
}

async function playCaptainBroadcast(text, style, { speechBase64, restoreBed = true } = {}) {
  if (!text?.trim()) return false;
  stopPlayback();
  try {
    await ensureAudioCtx();
    const prepPromise = speechBase64
      ? prepareCaptainSpeechFromBase64(speechBase64, text, style)
      : prepareCaptainSpeech(text, style);
    // wakeup 漸弱 → captain 漸強 → TTS 漸強
    await fadeCeremonyBedOut(CEREMONY_FADE.bedOut);
    await playCaptainIntro();
    stopCaptainIntro();
    const prepared = await prepPromise;
    await unlockMedia();
    if (!prepared) return await speakText(text);
    return await playPreparedSpeech(prepared);
  } catch {
    stopCaptainIntro();
    await muteCeremonyBedForSpeech();
    await unlockMedia();
    return speakText(text);
  } finally {
    stopCaptainIntro();
    if (restoreBed) await restoreCeremonyBed();
  }
}

if (window.speechSynthesis) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => speechSynthesis.getVoices());
}

window.BroadcastAudio = {
  playCaptainBroadcast,
  playCaptainIntro,
  stopCaptainIntro,
  prepareCaptainSpeech,
  playTowerSignal,
  startTowerSignalLoop,
  stopTowerSignalLoop,
  speakText,
  stopPlayback,
  primeFromUserGesture,
  unlockMedia,
  startMediaKeepAlive,
  stopMediaKeepAlive,
  releaseCeremonyMedia,
  playFlightSfx,
  stopFlightSfx,
  playLandingMusic,
  stopLandingMusic,
  resumeLandingMusicAfterApproach,
  fadeOutLandingMusic,
  duckCeremonyBed,
  fadeCeremonyBedOut,
  restoreCeremonyBed,
};
