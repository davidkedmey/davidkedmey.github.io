// Procedural ambient music (Web Audio API) + browser TTS voice system

const SETTINGS_KEY = 'biomorph-audio-settings';

let audioCtx = null;
let musicNodes = null;
let currentMood = 'farm';
let chordIdx = 0;
let chordTimer = null;

// ── Settings ──

const SETTINGS_VERSION = 2; // bump to reset user prefs on breaking changes

const settings = {
  musicEnabled: false,
  voiceEnabled: false,
  autoFollow: false,
  _v: SETTINGS_VERSION,
};

export function loadAudioSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Reset if settings are from an older version
      if (saved._v === SETTINGS_VERSION) {
        Object.assign(settings, saved);
      } else {
        // Old settings — apply new defaults, save them
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
    }
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
// Gentle ambient music: warm pad + arpeggiated plucks + occasional melody

// Note frequencies (Hz)
const N = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

// Each chord: [bass, ...pad notes, ...arp pool]
const CHORDS = {
  farm: [
    { bass: N.C3, pad: [N.E4, N.G4, N.C5],  arp: [N.C4, N.E4, N.G4, N.C5, N.E5] },    // C major
    { bass: N.F3, pad: [N.A3, N.C4, N.F4],   arp: [N.F4, N.A4, N.C5, N.F3, N.C4] },    // F major
    { bass: N.G3, pad: [N.B3, N.D4, N.G4],   arp: [N.G4, N.B4, N.D5, N.G3, N.D4] },    // G major
    { bass: N.A3, pad: [N.C4, N.E4, N.A4],   arp: [N.A4, N.C5, N.E5, N.A3, N.E4] },    // A minor
    { bass: N.F3, pad: [N.A3, N.C4, N.F4],   arp: [N.F4, N.A4, N.C5, N.F3, N.A3] },    // F major (return)
    { bass: N.C3, pad: [N.G3, N.C4, N.E4],   arp: [N.C4, N.G4, N.E4, N.C5, N.G3] },    // C major (inversion)
  ],
  study: [
    { bass: N.A3, pad: [N.C4, N.E4, N.A4],   arp: [N.A4, N.C5, N.E5, N.A3, N.C4] },    // A minor
    { bass: N.F3, pad: [N.A3, N.C4, N.F4],   arp: [N.F4, N.A4, N.C5, N.F3, N.C4] },    // F major
    { bass: N.D3, pad: [N.F3, N.A3, N.D4],   arp: [N.D4, N.F4, N.A4, N.D3, N.F3] },    // D minor
    { bass: N.G3, pad: [N.B3, N.D4, N.G4],   arp: [N.G4, N.B4, N.D4, N.G3, N.B3] },    // G major
    { bass: N.E3, pad: [N.G3, N.B3, N.E4],   arp: [N.E4, N.G4, N.B4, N.E3, N.B3] },    // E minor
    { bass: N.A3, pad: [N.C4, N.E4, N.A4],   arp: [N.A4, N.E4, N.C5, N.A3, N.E5] },    // A minor (return)
  ],
};

const MOOD_PARAMS = {
  farm:  { padCutoff: 600,  padQ: 0.8, arpCutoff: 2200, arpRate: 1.8, masterVol: 0.18, melodyChance: 0.35 },
  study: { padCutoff: 400,  padQ: 0.6, arpCutoff: 1400, arpRate: 2.5, masterVol: 0.14, melodyChance: 0.2 },
};

let arpTimer = null;
let melodyTimer = null;

// Play a single plucked note (short envelope, filtered)
function pluck(ctx, freq, dest, time, duration = 0.6, vol = 0.08) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, time);
  env.gain.exponentialRampToValueAtTime(vol * 0.6, time + 0.05);
  env.gain.exponentialRampToValueAtTime(0.001, time + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq * 4, time);
  filter.frequency.exponentialRampToValueAtTime(freq * 0.8, time + duration);
  filter.Q.value = 0.5;

  osc.connect(filter);
  filter.connect(env);
  env.connect(dest);

  osc.start(time);
  osc.stop(time + duration + 0.1);
}

// Play a gentle melody fragment (2-4 notes from the arp pool)
function playMelodyFragment() {
  if (!musicNodes || !audioCtx) return;
  const params = MOOD_PARAMS[currentMood] || MOOD_PARAMS.farm;
  const chords = CHORDS[currentMood] || CHORDS.farm;
  const chord = chords[chordIdx % chords.length];
  const pool = chord.arp;
  const t = audioCtx.currentTime;
  const noteCount = 2 + Math.floor(Math.random() * 3); // 2-4 notes
  const spacing = 0.4 + Math.random() * 0.3;

  for (let i = 0; i < noteCount; i++) {
    const freq = pool[Math.floor(Math.random() * pool.length)];
    // Melody notes: slightly louder, longer sustain, higher octave option
    const octaveUp = Math.random() < 0.3 ? 2 : 1;
    pluck(audioCtx, freq * octaveUp, musicNodes.melodyGain, t + i * spacing, 1.0 + Math.random() * 0.5, 0.06);
  }
}

// Schedule random arp plucks
function scheduleArp() {
  if (!musicNodes || !audioCtx) return;
  const params = MOOD_PARAMS[currentMood] || MOOD_PARAMS.farm;
  const chords = CHORDS[currentMood] || CHORDS.farm;
  const chord = chords[chordIdx % chords.length];
  const pool = chord.arp;
  const t = audioCtx.currentTime;

  // Play 1-2 pluck notes
  const count = Math.random() < 0.4 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const freq = pool[Math.floor(Math.random() * pool.length)];
    const delay = i * (0.15 + Math.random() * 0.15);
    pluck(audioCtx, freq, musicNodes.arpGain, t + delay, 0.5 + Math.random() * 0.4, 0.05 + Math.random() * 0.03);
  }

  // Next arp in 0.8-3s (randomized for organic feel)
  const next = (params.arpRate * 0.5) + Math.random() * params.arpRate;
  arpTimer = setTimeout(scheduleArp, next * 1000);
}

export function startMusic(mood = 'farm') {
  if (!settings.musicEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  currentMood = mood;

  if (ctx.state !== 'running') {
    pendingMood = mood;
    return;
  }

  if (musicNodes) { setMood(mood); return; }

  const params = MOOD_PARAMS[mood] || MOOD_PARAMS.farm;
  const chords = CHORDS[mood] || CHORDS.farm;

  // Master output with slow fade-in
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, ctx.currentTime);
  master.connect(ctx.destination);
  master.gain.exponentialRampToValueAtTime(params.masterVol, ctx.currentTime + 4);

  // ── Warm pad: 3 sine oscillators through heavy lowpass ──
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = params.padCutoff;
  padFilter.Q.value = params.padQ;
  padFilter.connect(master);

  const padGain = ctx.createGain();
  padGain.gain.value = 0.12;
  padGain.connect(padFilter);

  const chord = chords[0];
  const padOscs = chord.pad.map(freq => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(padGain);
    osc.start();
    return osc;
  });

  // ── Sub bass: single sine, very low and warm ──
  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'sine';
  bassOsc.frequency.value = chord.bass;
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.06;
  bassOsc.connect(bassGain);
  bassGain.connect(master);
  bassOsc.start();

  // ── Slow LFO on pad filter for breathing movement ──
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.04; // very slow
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = params.padCutoff * 0.3;
  lfo.connect(lfoGain);
  lfoGain.connect(padFilter.frequency);
  lfo.start();

  // ── Arp channel: plucked notes go through their own filter ──
  const arpFilter = ctx.createBiquadFilter();
  arpFilter.type = 'lowpass';
  arpFilter.frequency.value = params.arpCutoff;
  arpFilter.Q.value = 0.3;
  arpFilter.connect(master);

  const arpGain = ctx.createGain();
  arpGain.gain.value = 1.0;
  arpGain.connect(arpFilter);

  // ── Melody channel: separate gain for melodic fragments ──
  const melodyFilter = ctx.createBiquadFilter();
  melodyFilter.type = 'lowpass';
  melodyFilter.frequency.value = params.arpCutoff * 0.8;
  melodyFilter.Q.value = 0.5;
  melodyFilter.connect(master);

  const melodyGain = ctx.createGain();
  melodyGain.gain.value = 0.8;
  melodyGain.connect(melodyFilter);

  // Cycle chords every 8 seconds
  chordIdx = 0;
  chordTimer = setInterval(cycleChord, 8000);

  // Melody fragments every 12-20 seconds
  function scheduleMelody() {
    if (!musicNodes) return;
    const p = MOOD_PARAMS[currentMood] || MOOD_PARAMS.farm;
    if (Math.random() < p.melodyChance) playMelodyFragment();
    melodyTimer = setTimeout(scheduleMelody, 12000 + Math.random() * 8000);
  }

  musicNodes = { master, padOscs, padGain, padFilter, bassOsc, bassGain, lfo, lfoGain, arpGain, arpFilter, melodyGain, melodyFilter };

  // Start arp and melody schedulers
  scheduleArp();
  setTimeout(scheduleMelody, 5000 + Math.random() * 5000);
}

function cycleChord() {
  if (!musicNodes || !audioCtx) return;
  const chords = CHORDS[currentMood] || CHORDS.farm;
  chordIdx = (chordIdx + 1) % chords.length;
  const chord = chords[chordIdx];
  const t = audioCtx.currentTime;

  // Smooth pad transition
  musicNodes.padOscs.forEach((osc, i) => {
    if (chord.pad[i]) osc.frequency.exponentialRampToValueAtTime(chord.pad[i], t + 3);
  });

  // Smooth bass transition
  musicNodes.bassOsc.frequency.exponentialRampToValueAtTime(chord.bass, t + 3);
}

function setMood(mood) {
  if (!musicNodes || !audioCtx) return;
  currentMood = mood;
  const t = audioCtx.currentTime;
  const params = MOOD_PARAMS[mood] || MOOD_PARAMS.farm;

  // Smooth filter transitions
  musicNodes.padFilter.frequency.linearRampToValueAtTime(params.padCutoff, t + 3);
  musicNodes.arpFilter.frequency.linearRampToValueAtTime(params.arpCutoff, t + 3);
  musicNodes.lfoGain.gain.linearRampToValueAtTime(params.padCutoff * 0.3, t + 3);
  musicNodes.master.gain.linearRampToValueAtTime(params.masterVol, t + 3);

  // Jump to first chord of new mood
  const chords = CHORDS[mood] || CHORDS.farm;
  chordIdx = 0;
  const chord = chords[0];
  chord.pad.forEach((freq, i) => {
    if (musicNodes.padOscs[i]) {
      musicNodes.padOscs[i].frequency.exponentialRampToValueAtTime(freq, t + 4);
    }
  });
  musicNodes.bassOsc.frequency.exponentialRampToValueAtTime(chord.bass, t + 4);
}

function fadeOutMusic() {
  if (chordTimer) { clearInterval(chordTimer); chordTimer = null; }
  if (arpTimer) { clearTimeout(arpTimer); arpTimer = null; }
  if (melodyTimer) { clearTimeout(melodyTimer); melodyTimer = null; }
  if (!musicNodes || !audioCtx) return;
  musicNodes.master.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 2);
  const nodes = musicNodes;
  musicNodes = null;
  setTimeout(() => {
    try {
      nodes.padOscs.forEach(o => o.stop());
      nodes.bassOsc.stop();
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
