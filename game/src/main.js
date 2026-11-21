// main.js — the bootstrap and the conductor.
//
// Builds the world (city, cars, people, police, combat, missions),
// owns the shared game state every module reads, runs the title /
// playing / paused / ended state machine, and steps the simulation at
// a fixed 60 Hz so a second of game is a second of game on any display.
//
// Shot mode (?shot=<name>&seed=1) skips the title entirely: the stager
// composes a scene, pre-simulates it, and the frame freezes for capture.
import * as THREE from 'three';
import { seedWorld, Input, clamp } from './utils.js';
import { buildCity } from './city.js';
import { spawnTraffic, updateTrafficCar } from './vehicles.js';
import { spawnPeds, updatePeds } from './peds.js';
import { makePlayer, updatePlayer, updateCamera } from './player.js';
import { initPolice, updatePolice, policeSeePlayer } from './police.js';
import { initCombat, updateCombat, enemyShootAt } from './combat.js';
import { buildMarker, initMissions, updateMissions, requestMission, startCourier, startRace } from './missions.js';
import { Effects } from './effects.js';
import * as hud from './hud.js';
import * as audio from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1) >>> 0;
seedWorld(seed);

// ---- renderer, scene, light -------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const palette = params.get('palette') === 'golden' ? 'golden' : 'dusk';
if (palette === 'golden') {
  scene.background = new THREE.Color(0xf7b98a);
  scene.fog = new THREE.Fog(0xf7b98a, 190, 520);
} else {
  // Neon dusk, the shipped look: deep purple-blue sky, low orange sun,
  // amber windows doing the talking.
  scene.background = new THREE.Color(0x2a1e4a);
  scene.fog = new THREE.Fog(0x2a1e4a, 170, 500);
}
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 3, 130);

const hemi = new THREE.HemisphereLight(palette === 'golden' ? 0xffe0b8 : 0x8a7ad8, 0x1c1430, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(palette === 'golden' ? 0xffd9a0 : 0xff8a4a, 1.15);
sun.position.set(palette === 'golden' ? 60 : -80, palette === 'golden' ? 120 : 34, 90);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- shared state -------------------------------------------------------
const state = {
  scene, camera, renderer, palette,
  time: 0, mode: 'title', frozen: false,
  errors: [],
  money: 0, missionsDone: 0, storyDone: false,
  objectiveText: 'Welcome to Solmar City — press M for the next job',
  traffic: [], allCars: [], peds: [], copCars: [], cops: [], gang: [], pickups: [],
  comet: null, starterCar: null,
  camMode: 'foot', speedRatio: 0, sirenActive: false,
  gunfireTimer: 0,
  audioShoot: false, audioPickup: false, audioCash: false,
  audioMissionDone: false, audioHit: false, audioEngine: false,
};
window.addEventListener('error', (e) => { state.errors.push(String(e.message || e.error)); });

state.input = new Input(renderer.domElement);
state.effects = new Effects(scene);
const cityGroup = buildCity(scene);
buildMarker(scene);
state.player = makePlayer(scene);
state.player.pos.set(-40, 0, 108);
spawnTraffic(scene, state);
spawnPeds(scene, state);
initPolice(state);
initCombat(state);
// If a save exists, its found tokens must be known before the mission
// module lays the token pickups — otherwise found tokens would respawn.
const bootSave = loadSave();
if (bootSave && bootSave.tokens.length === 10) state.tokensFound = bootSave.tokens;
initMissions(state);

// Helpers the modules call through state, wired here so no module has
// to import the conductor.
state.toast = (t) => hud.toast(t);
state.showBanner = (t, x) => hud.showBanner(t, x);
state.setObjective = (t) => { state.objectiveText = t; };
state.addMoney = (n) => { state.money += n; };
state.setWanted = (n) => {
  state.wanted = clamp(n, 0, 5);
  state.wantedDecay = 0;
};
state.policeSeePlayer = () => policeSeePlayer(state);
state.commitCrime = (stars) => {
  if (state.wanted < 5) state.setWanted(Math.min(5, state.wanted + stars));
};
state.enemyShoot = (fromPos, dmg) => enemyShootAt(state, fromPos, dmg);
state.damagePlayer = (amount, fromPos) => {
  const p = state.player;
  if (state.mode !== 'playing' || p.dead) return;
  p.health -= amount;
  hud.flashDamage();
  state.effects.addShake(0.25);
  audio.sfxHit();
  if (p.health <= 0) { p.health = 0; state.endGame('wasted'); }
};
state.endGame = (kind) => {
  if (state.mode !== 'playing') return;
  state.mode = 'ended';
  audio.sfxBusted();
  audio.radioStop();
  document.exitPointerLock && document.exitPointerLock();
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    text.textContent = 'The Solmar police walk Jax to a cell. The night restarts at the title.';
  } else {
    title.textContent = 'WASTED';
    text.textContent = 'Jax wakes up in Solmar Hospital with less than he started with.';
  }
  document.getElementById('end-screen').style.display = 'flex';
  if (kind === 'wasted') state.money = Math.max(0, state.money - 100);
};
state.collectToken = (i) => {
  state.tokensFound[i] = true;
  state.addMoney(25);
  const found = state.tokensFound.filter(Boolean).length;
  hud.toast(`Solmar token ${found} of 10 — +$25`);
  state.saveNow();
};
state.onGangKilled = () => { /* missions poll the gang list themselves */ };
state.saveNow = () => writeSave(state);
// Reduced updaters the shot stager steps a frozen scene with.
state.updateTrafficOnly = (dt) => { for (const c of state.traffic) updateTrafficCar(c, dt, state); };
state.updatePedsOnly = (dt) => updatePeds(dt, state);
state.updateGangOnly = (dt) => updateCombat(dt, state);

// ---- screens and flow ---------------------------------------------------
hud.initHud();
const shotName = params.get('shot');
const isShot = shotName && SHOT_NAMES.includes(shotName);

function startGame(fresh) {
  if (fresh) {
    clearSave();
    state.money = 0; state.missionsDone = 0; state.storyDone = false;
    state.tokensFound = Array(10).fill(false);
  } else {
    const save = loadSave();
    if (save) {
      state.money = save.money;
      state.missionsDone = save.missionsDone;
      state.storyDone = save.storyDone;
      state.tokensFound = save.tokens.length === 10 ? save.tokens : Array(10).fill(false);
      if (save.pos) state.player.pos.set(save.pos.x, 0, save.pos.z);
    }
  }
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  hud.showHud();
  state.mode = 'playing';
  state.player.health = 100;
  state.player.dead = false;
  audio.radioStart();
  state.input.requestLock();
  if (state.missionsDone >= 8) state.setObjective('Story complete — free roam. M: side work, T: courier, G: race');
  else state.setObjective(`Press M for the next job: job ${state.missionsDone + 1} of 8`);
}

if (isShot) {
  state.mode = 'playing';
  hud.showHud();
  stageShot(state, shotName);
} else {
  document.getElementById('title-screen').style.display = 'flex';
  const save = loadSave();
  if (save) document.getElementById('continue-game').style.display = 'inline-block';
  document.getElementById('new-game').addEventListener('click', () => startGame(true));
  document.getElementById('continue-game').addEventListener('click', () => startGame(false));
  document.getElementById('resume-game').addEventListener('click', () => {
    document.getElementById('pause-screen').style.display = 'none';
    state.mode = 'playing';
    state.input.requestLock();
  });
  document.getElementById('retry-game').addEventListener('click', () => {
    document.getElementById('end-screen').style.display = 'none';
    state.player.health = 100;
    state.setWanted(0);
    state.player.pos.set(-40, 0, 108);
    state.mode = 'playing';
    state.input.requestLock();
  });
  document.getElementById('title-game').addEventListener('click', () => location.reload());
  renderer.domElement.addEventListener('click', () => {
    if (state.mode === 'playing') state.input.requestLock();
  });
}

// ---- the fixed-step simulation ------------------------------------------
function step(dt) {
  state.time += dt;
  const input = state.input;
  if (input.wasPressed('KeyM')) requestMission(state);
  if (input.wasPressed('KeyT')) startCourier(state);
  if (input.wasPressed('KeyG')) startRace(state);
  if (input.wasPressed('KeyH')) audio.sfxHorn();
  if (input.wasPressed('Escape')) {
    document.getElementById('pause-screen').style.display = 'flex';
    state.mode = 'paused';
    document.exitPointerLock && document.exitPointerLock();
  }
  updatePlayer(dt, state);
  for (const car of state.traffic) updateTrafficCar(car, dt, state);
  updatePeds(dt, state);
  updatePolice(dt, state);
  updateCombat(dt, state);
  updateMissions(dt, state);
  state.effects.update(dt);
  // Clouds drift, slow enough to read as weather, not traffic.
  if (cityGroup.userData.clouds) {
    cityGroup.userData.clouds.position.x = Math.sin(state.time * 0.01) * 14;
  }
  // One-shot audio flags the modules raised this step.
  if (state.audioShoot) { audio.sfxShoot(); state.audioShoot = false; }
  if (state.audioPickup) { audio.sfxPickup(); state.audioPickup = false; }
  if (state.audioCash) { audio.sfxCash(); state.audioCash = false; }
  if (state.audioMissionDone) { audio.sfxMissionDone(); state.audioMissionDone = false; }
  if (state.audioHit) { audio.sfxHit(); state.audioHit = false; }
  audio.engineUpdate(state.speedRatio, state.player.inCar);
  if (state.player.inCar) audio.engineStart();
  audio.sirenUpdate(state.sirenActive && state.mode === 'playing');
  updateCamera(state, dt);
  // Camera shake rides on top of wherever the camera settled.
  const sh = state.effects.shakeOffset(state.time);
  camera.position.x += sh.x; camera.position.y += sh.y;
  hud.updateHud(dt, state);
  input.endFrame();
}

let last = performance.now(), accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = Math.min(0.12, (now - last) / 1000);
  last = now;
  if (state.mode === 'playing' && !state.frozen) {
    accumulator += elapsed;
    while (accumulator >= 1 / 60) { step(1 / 60); accumulator -= 1 / 60; }
  } else if (state.mode === 'title') {
    // A slow orbital pan behind the title screen.
    state.time += elapsed;
    const r = 150, a = state.time * 0.03;
    camera.position.set(Math.sin(a) * r, 42, Math.cos(a) * r);
    camera.lookAt(0, 10, 0);
    state.effects.update(elapsed);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
