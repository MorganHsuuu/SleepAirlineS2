/** 機長廣播：captain.mp3 前段 → OpenAI TTS（失敗則瀏覽器 TTS） */
let audioCtx = null;
let currentAudio = null;
let flightSfxAudio = null;
let landingAudio = null;
let landingVolume = 0.38;

const CAPTAIN_SFX = {
  url: 'media/captain.mp3',
  seconds: 7,
  volume: 0.88,
};

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
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function fadeAudioVolume(audio, from, to, ms) {
  return new Promise((resolve) => {
    if (!audio || ms <= 0) {
      if (audio) audio.volume = to;
      resolve();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      audio.volume = from + (to - from) * p;
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

function playTimedClip(url, { seconds = 0, volume = 1, loop = false } = {}) {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    const audio = new Audio(url);
    audio.volume = volume;
    audio.loop = loop;
    audio.playsInline = true;
    currentAudio = audio;
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (currentAudio === audio) currentAudio = null;
      try { audio.pause(); } catch { /* noop */ }
      resolve(ok);
    };
    if (seconds > 0) timer = setTimeout(() => finish(true), seconds * 1000);
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

async function playCaptainIntro() {
  const cfg = { ...CAPTAIN_SFX, ...window.SLEEP_AIRLINE_CAPTAIN_SFX };
  if (!cfg.url) return false;
  const ok = await playTimedClip(cfg.url, {
    seconds: cfg.seconds ?? 7,
    volume: cfg.volume ?? 0.88,
  });
  if (ok) return true;
  await playAttentionBeeps();
  await playPaChime();
  return false;
}

async function playFlightSfx(url, { loop = true, volume = 0.65, fadeInMs = 700 } = {}) {
  stopFlightSfx({ fade: false });
  if (!url) return false;
  const audio = new Audio(url);
  audio.loop = loop;
  audio.volume = 0;
  flightSfxAudio = audio;
  audio.onerror = () => { if (flightSfxAudio === audio) flightSfxAudio = null; };
  try {
    await audio.play();
    await fadeAudioVolume(audio, 0, volume, fadeInMs);
    return true;
  } catch {
    flightSfxAudio = null;
    return false;
  }
}

async function stopFlightSfx({ fade = true, ms = 550 } = {}) {
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
  landingVolume = typeof opts.volume === 'number' ? opts.volume : 0.38;
  const audio = new Audio(url);
  audio.loop = opts.loop !== false;
  audio.volume = 0;
  landingAudio = audio;
  audio.onerror = () => { if (landingAudio === audio) landingAudio = null; };
  try {
    await audio.play();
    await fadeAudioVolume(audio, 0, landingVolume, opts.fadeInMs ?? 1600);
    return true;
  } catch {
    if (landingAudio === audio) landingAudio = null;
    return false;
  }
}

async function stopLandingMusic({ fade = true, ms = 900 } = {}) {
  const audio = landingAudio;
  if (!audio) return;
  landingAudio = null;
  const vol = audio.volume;
  if (fade) await fadeAudioVolume(audio, vol, 0, ms);
  audio.pause();
  try { audio.currentTime = 0; } catch { /* noop */ }
  audio.src = '';
}

function duckLandingMusic() {
  if (landingAudio) landingAudio.volume = Math.min(landingVolume * 0.25, 0.1);
}

function restoreLandingMusic() {
  if (landingAudio) landingAudio.volume = landingVolume;
}

let mediaUnlocked = false;
let keepAliveAudio = null;

/** 儀式期間維持極小聲 loop，避免 API 等待後 Audio / TTS 被瀏覽器擋住 */
async function startMediaKeepAlive() {
  if (keepAliveAudio && !keepAliveAudio.paused) return true;
  if (keepAliveAudio?.paused) {
    try {
      await keepAliveAudio.play();
      mediaUnlocked = true;
      return true;
    } catch { /* recreate below */ }
  }
  const audio = new Audio(CAPTAIN_SFX.url);
  audio.loop = true;
  audio.volume = 0.001;
  audio.preload = 'auto';
  audio.playsInline = true;
  keepAliveAudio = audio;
  try {
    await audio.play();
    mediaUnlocked = true;
    return true;
  } catch {
    keepAliveAudio = null;
    return false;
  }
}

function stopMediaKeepAlive() {
  if (!keepAliveAudio) return;
  const audio = keepAliveAudio;
  keepAliveAudio = null;
  try { audio.pause(); } catch { /* noop */ }
  try { audio.currentTime = 0; } catch { /* noop */ }
  audio.removeAttribute('src');
  audio.load();
}

/** 在使用者點擊當下解鎖 Audio / Video 自動播放（避免 API 等待後被瀏覽器擋住） */
async function unlockMedia() {
  await ensureAudioCtx();
  if (await startMediaKeepAlive()) return true;
  try {
    const probe = new Audio(CAPTAIN_SFX.url);
    probe.volume = 0.001;
    probe.preload = 'auto';
    probe.playsInline = true;
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
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-TW';
    utter.rate = 0.9;
    utter.pitch = 0.95;
    const voice = pickZhVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => resolve(true);
    utter.onerror = () => resolve(false);
    speechSynthesis.speak(utter);
  });
}

async function speakText(text) {
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
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = 'auto';
  const ready = await new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (!ok) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      resolve({ kind: 'openai', audio, url, fallbackText: text });
    };
    audio.oncanplaythrough = () => finish(true);
    audio.onerror = () => finish(false);
    audio.load();
    setTimeout(() => finish(true), 1500);
  });
  return ready;
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

async function playPreparedSpeech(prepared) {
  if (!prepared) return false;
  if (prepared.kind === 'browser') return speakText(prepared.text);
  const { audio, url } = prepared;
  audio.playsInline = true;
  currentAudio = audio;
  const ok = await playAudioElement(audio);
  if (!ok) {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
    return speakText(prepared.fallbackText || '');
  }
  return new Promise((resolve) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve(true);
    };
    audio.onerror = async () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve(await speakText(prepared.fallbackText || ''));
    };
  });
}

async function speakWithOpenAI(text, style) {
  const blob = await fetchOpenAISpeechBlob(text, style);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  return playPreparedSpeech({ kind: 'openai', audio: new Audio(url), url });
}

async function playCaptainBroadcast(text, style, { speechBase64 } = {}) {
  if (!text?.trim()) return false;
  stopPlayback();
  duckLandingMusic();
  try {
    await unlockMedia();
    const prepPromise = speechBase64
      ? prepareCaptainSpeechFromBase64(speechBase64, text, style)
      : prepareCaptainSpeech(text, style);
    await playCaptainIntro();
    const prepared = await prepPromise;
    if (prepared) return playPreparedSpeech(prepared);
    return speakText(text);
  } catch {
    return speakText(text);
  } finally {
    restoreLandingMusic();
  }
}

if (window.speechSynthesis) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => speechSynthesis.getVoices());
}

window.BroadcastAudio = {
  playCaptainBroadcast,
  prepareCaptainSpeech,
  playTowerSignal,
  startTowerSignalLoop,
  stopTowerSignalLoop,
  speakText,
  stopPlayback,
  unlockMedia,
  startMediaKeepAlive,
  stopMediaKeepAlive,
  releaseCeremonyMedia,
  playFlightSfx,
  stopFlightSfx,
  playLandingMusic,
  stopLandingMusic,
};
