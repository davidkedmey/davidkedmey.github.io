// Procedural ambient music (Web Audio API) + browser TTS voice system

const SETTINGS_KEY = 'biomorph-audio-settings';

let audioCtx = null;
let musicNodes = null;
let currentMood = 'farm';
let chordIdx = 0;
let chordTimer = null;

// ── Settings ──

const settings = {
  musicEnabled: true,
  voiceEnabled: true,
  autoFollow: true,
};

export function loadAudioSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) {}
  return settings;
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

export function getAudioSettings() { return settings; }

export function toggleMusic() {
  settings.musicEnabled = !settings.musicEnabled;
  if (settings.musicEnabled) {
    // Ensure audio context exists and is active
    const ctx = ensureAudio();
    if (ctx && ctx.state === 'running') {
      startMusic(currentMood);
    } else {
      pendingMood = currentMood;
    }
  } else {
    pendingMood = null; // cancel any pending start
    fadeOutMusic();
  }
  saveSettings();
  return settings.musicEnabled;
}

export function toggleVoice() {
  settings.voiceEnabled = !settings.voiceEnabled;
  if (!settings.voiceEnabled) stopSpeech();
  saveSettings();
  return settings.voiceEnabled;
}

export function toggleAutoFollow() {
  settings.autoFollow = !settings.autoFollow;
  saveSettings();
  return settings.autoFollow;
}

// ── Audio Context ──

let pendingMood = null; // mood to start once context is running

function ensureAudio() {
  if (typeof window === 'undefined') return null;
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      // Context just became active — start pending music if any
      if (pendingMood && settings.musicEnabled && !musicNodes) {
        startMusic(pendingMood);
        pendingMood = null;
      }
    });
  }
  return audioCtx;
}

// Creates AudioContext on user gesture and starts pending music.
// Stays active until music has actually started (context may not resume on first gesture).
export function initOnInteraction() {
  const handler = () => {
    const ctx = ensureAudio();
    if (!ctx) return;
    // Check if we can start music now
    if (ctx.state === 'running' && pendingMood && settings.musicEnabled && !musicNodes) {
      startMusic(pendingMood);
      pendingMood = null;
    }
    // Only remove listener once music is actually playing or no music is pending
    if (musicNodes || !pendingMood) {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('click', handler);
    }
  };
  document.addEventListener('keydown', handler);
  document.addEventListener('click', handler);
}

// ── Procedural Music ──

// Chord progressions: I-IV-V-vi (farm, bright) and i-VI-iv-V (study)
const CHORDS = {
  farm: [
    [261.63, 329.63, 392.00], // C4 E4 G4  (C major)
    [174.61, 220.00, 261.63], // F3 A3 C4  (F major)
    [196.00, 246.94, 293.66], // G3 B3 D4  (G major)
    [220.00, 261.63, 329.63], // A3 C4 E4  (A minor)
  ],
  study: [
    [220.00, 261.63, 329.63], // A3 C4 E4  (A minor)
    [174.61, 220.00, 261.63], // F3 A3 C4  (F major)
    [146.83, 174.61, 220.00], // D3 F3 A3  (D minor)
    [164.81, 207.65, 261.63], // E3 G#3 C4 (E major, dominant)
  ],
};

const FILTER_FREQ = { farm: 1800, study: 700 };
const DRONE_FREQ = { farm: 130.81, study: 110.00 }; // C3 vs A2

export function startMusic(mood = 'farm') {
  if (!settings.musicEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  currentMood = mood;

  // Context not yet running — queue it for when resume completes
  if (ctx.state !== 'running') {
    pendingMood = mood;
    return;
  }

  // Already running — just crossfade mood
  if (musicNodes) { setMood(mood); return; }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, ctx.currentTime);
  master.connect(ctx.destination);
  master.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 3);

  // Drone: two slightly detuned sine waves
  const droneFreq = DRONE_FREQ[mood] || 65.41;
  const drone1 = ctx.createOscillator();
  drone1.type = 'sine';
  drone1.frequency.value = droneFreq;
  const drone2 = ctx.createOscillator();
  drone2.type = 'sine';
  drone2.frequency.value = droneFreq * 1.004;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.12;
  drone1.connect(droneGain);
  drone2.connect(droneGain);
  droneGain.connect(master);
  drone1.start();
  drone2.start();

  // Pad: 3 triangle oscillators through a lowpass filter
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = FILTER_FREQ[mood] || 900;
  padFilter.Q.value = 1.5;
  padFilter.connect(master);

  const padGain = ctx.createGain();
  padGain.gain.value = 0.09;
  padGain.connect(padFilter);

  const chords = CHORDS[mood] || CHORDS.farm;
  const padOscs = chords[0].map(freq => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(padGain);
    osc.start();
    return osc;
  });

  // Slow LFO on filter cutoff for gentle movement
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain);
  lfoGain.connect(padFilter.frequency);
  lfo.start();

  // Cycle chords every 10 seconds
  chordIdx = 0;
  chordTimer = setInterval(cycleChord, 10000);

  musicNodes = { master, drone1, drone2, droneGain, padOscs, padGain, padFilter, lfo, lfoGain };
}

function cycleChord() {
  if (!musicNodes || !audioCtx) return;
  const chords = CHORDS[currentMood] || CHORDS.farm;
  chordIdx = (chordIdx + 1) % chords.length;
  const chord = chords[chordIdx];
  const t = audioCtx.currentTime;
  musicNodes.padOscs.forEach((osc, i) => {
    if (chord[i]) osc.frequency.exponentialRampToValueAtTime(chord[i], t + 4);
  });
}

function setMood(mood) {
  if (!musicNodes || !audioCtx) return;
  currentMood = mood;
  const t = audioCtx.currentTime;

  // Smooth filter transition
  musicNodes.padFilter.frequency.linearRampToValueAtTime(FILTER_FREQ[mood] || 900, t + 3);

  // Shift drone pitch
  const droneFreq = DRONE_FREQ[mood] || 65.41;
  musicNodes.drone1.frequency.exponentialRampToValueAtTime(droneFreq, t + 4);
  musicNodes.drone2.frequency.exponentialRampToValueAtTime(droneFreq * 1.004, t + 4);

  // Jump to first chord of new mood
  const chords = CHORDS[mood] || CHORDS.farm;
  chordIdx = 0;
  chords[0].forEach((freq, i) => {
    if (musicNodes.padOscs[i]) {
      musicNodes.padOscs[i].frequency.exponentialRampToValueAtTime(freq, t + 4);
    }
  });
}

function fadeOutMusic() {
  if (chordTimer) { clearInterval(chordTimer); chordTimer = null; }
  if (!musicNodes || !audioCtx) return;
  musicNodes.master.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 2);
  const nodes = musicNodes;
  musicNodes = null;
  setTimeout(() => {
    try {
      nodes.drone1.stop(); nodes.drone2.stop();
      nodes.padOscs.forEach(o => o.stop());
      nodes.lfo.stop();
      nodes.master.disconnect();
    } catch (e) {}
  }, 2500);
}

export function stopMusic() { pendingMood = null; fadeOutMusic(); }

export function setMusicMood(mood) {
  if (!musicNodes) {
    if (settings.musicEnabled) startMusic(mood);
    return;
  }
  setMood(mood);
}

// ── Text-to-Speech ──

let voices = [];
let voicesLoaded = false;

function loadVoices() {
  voices = window.speechSynthesis?.getVoices() || [];
  voicesLoaded = voices.length > 0;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function findVoice(prefs) {
  if (!voicesLoaded) loadVoices();
  for (const p of prefs) {
    const v = voices.find(v => v.name.includes(p));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('en')) || null;
}

let lastSpokenText = '';

export function speak(text, character = 'sage') {
  if (!settings.voiceEnabled || !window.speechSynthesis || !text) return;
  if (text === lastSpokenText) return;
  lastSpokenText = text;

  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);

  if (character === 'dawkins') {
    utt.voice = findVoice(['Daniel', 'Oliver', 'George']);
    utt.rate = 0.9;
    utt.pitch = 0.95;
  } else if (character === 'fern') {
    utt.voice = findVoice(['Samantha', 'Karen', 'Fiona', 'Tessa']);
    utt.rate = 0.95;
    utt.pitch = 1.15;
  } else if (character === 'moss') {
    utt.voice = findVoice(['Daniel', 'Oliver', 'George', 'Aaron']);
    utt.rate = 1.0;
    utt.pitch = 1.0;
  } else {
    utt.voice = findVoice(['Samantha', 'Karen', 'Fiona', 'Tessa']);
    utt.rate = 1.0;
    utt.pitch = 1.1;
  }

  utt.volume = 0.8;
  window.speechSynthesis.speak(utt);
}

export function stopSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    lastSpokenText = '';
  }
}

export function resetLastSpoken() {
  lastSpokenText = '';
}
