// audio.js — every sound in Solmar Heat is synthesised with WebAudio.
//
// There are no audio files in the game folder at all. The engine is an
// oscillator whose pitch follows the car's speed, the siren is a slow
// triangle sweep, gunfire is a burst of filtered noise, and SOLMAR FM is
// a two-oscillator loop walking A minor, F, C, G. Every entry point is
// wrapped so a missing or blocked AudioContext can never break the game:
// browsers refuse audio before a user gesture, and the game must not care.
let ctx = null;
let engineOsc = null, engineGain = null;
let sirenOsc = null, sirenGain = null;
let radioTimer = null;

function ac() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (err) {
    ctx = null;
  }
  return ctx;
}

function beep(freq, dur, type = 'square', vol = 0.12, when = 0) {
  const a = ac(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + when + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + when); o.stop(a.currentTime + when + dur);
  } catch (err) { /* audio is decoration, never a dependency */ }
}

export function sfxShoot() {
  const a = ac(); if (!a) return;
  try {
    const len = Math.floor(a.sampleRate * 0.09);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = a.createGain(); g.gain.value = 0.22;
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start();
  } catch (err) { /* ignore */ }
}

export function sfxCash() { beep(880, 0.09, 'square', 0.1); beep(1320, 0.14, 'square', 0.1, 0.08); }
export function sfxClick() { beep(520, 0.05, 'square', 0.07); }
export function sfxHorn() { beep(196, 0.35, 'sawtooth', 0.14); beep(147, 0.35, 'sawtooth', 0.1); }
export function sfxPickup() { beep(660, 0.08, 'sine', 0.12); beep(990, 0.12, 'sine', 0.12, 0.07); }
export function sfxMissionDone() { [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.16, 'triangle', 0.13, i * 0.11)); }
export function sfxBusted() { [392, 330, 262, 196].forEach((f, i) => beep(f, 0.22, 'triangle', 0.13, i * 0.15)); }
export function sfxHit() { beep(110, 0.08, 'sawtooth', 0.1); }

export function engineStart() {
  const a = ac(); if (!a || engineOsc) return;
  try {
    engineOsc = a.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
    engineGain = a.createGain(); engineGain.gain.value = 0.0;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(a.destination);
    engineOsc.start();
  } catch (err) { engineOsc = null; }
}
export function engineUpdate(speedRatio, driving) {
  if (!engineOsc || !ctx) return;
  try {
    engineOsc.frequency.value = 55 + speedRatio * 130;
    engineGain.gain.value = driving ? 0.05 : 0.0;
  } catch (err) { /* ignore */ }
}
export function sirenUpdate(active) {
  const a = ac(); if (!a) return;
  try {
    if (active && !sirenOsc) {
      sirenOsc = a.createOscillator(); sirenOsc.type = 'triangle';
      sirenGain = a.createGain(); sirenGain.gain.value = 0.028;
      const lfo = a.createOscillator(); lfo.frequency.value = 0.7;
      const lfoGain = a.createGain(); lfoGain.gain.value = 180;
      lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
      sirenOsc.frequency.value = 760;
      sirenOsc.connect(sirenGain); sirenGain.connect(a.destination);
      sirenOsc.start(); lfo.start();
      sirenOsc.userData = { lfo };
    } else if (!active && sirenOsc) {
      sirenOsc.stop(); if (sirenOsc.userData.lfo) sirenOsc.userData.lfo.stop();
      sirenOsc = null;
    }
  } catch (err) { sirenOsc = null; }
}

// SOLMAR FM: a lazy sunset loop. A bass note and a soft fifth from each
// chord in turn, scheduled on an interval; stop when the game pauses.
const CHORDS = [110, 87.3, 130.8, 98]; // A2, F2, C3, G2
export function radioStart() {
  if (radioTimer || !ac()) return;
  let step = 0;
  const play = () => {
    const root = CHORDS[step % CHORDS.length];
    beep(root, 1.6, 'sine', 0.07);
    beep(root * 1.5, 1.6, 'sine', 0.045, 0.05);
    beep(root * 2, 0.8, 'triangle', 0.03, 0.4);
    step++;
  };
  play();
  radioTimer = setInterval(play, 1700);
}
export function radioStop() {
  if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
}
