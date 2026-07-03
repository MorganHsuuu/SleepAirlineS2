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

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, startSec, durSec, volume = 0.12) {
  const ctx = getAudioCtx();
  if (!ctx) return;
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

function playTimedClip(url, { seconds = 0, volume = 1, loop = false } = {}) {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    const audio = new Audio(url);
    audio.volume = volume;
    audio.loop = loop;
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
    audio.play().catch(() => finish(false));
  });
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

async function playAttentionBeeps() {
  tone(520, 0, 0.08, 0.09);
  await delay(200);
  tone(520, 0, 0.08, 0.09);
  await delay(200);
  tone(520, 0, 0.08, 0.09);
  await delay(280);
}

async function playPaChime() {
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

function speakText(text) {
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

async function speakWithOpenAI(text, style) {
  try {
    const res = await fetch('/api/broadcast/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, style: style || 'formal_captain' }),
    });
    if (!res.ok) return false;

    const blob = await res.blob();
    if (!blob.size || !blob.type.startsWith('audio/')) return false;

    const url = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve(true);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      };
      audio.play().catch(() => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

async function playCaptainBroadcast(text, style) {
  if (!text?.trim()) return false;
  stopPlayback();
  duckLandingMusic();
  try {
    await playCaptainIntro();
    const usedOpenAI = await speakWithOpenAI(text, style);
    if (usedOpenAI) return true;
    return await speakText(text);
  } catch {
    return false;
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
  speakText,
  stopPlayback,
  playFlightSfx,
  stopFlightSfx,
  playLandingMusic,
  stopLandingMusic,
};
