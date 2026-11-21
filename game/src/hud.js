// hud.js — everything the player reads: the HUD elements and the
// circular minimap.
//
// The HUD is plain DOM over the canvas (the markup lives in index.html);
// this module only writes values into it, and only when they change, so
// the page is not re-layouted sixty times a second. The minimap is a 2D
// canvas: the road grid, the beach and sea, then blips — white arrow for
// Jax, blue for police, red for Vultures, gold for tokens, and a yellow
// diamond on the current objective.
import { clamp } from './utils.js';

const els = {};
let lastText = {};
export function initHud() {
  for (const id of ['hud', 'money', 'objective', 'stars', 'clock', 'radio',
    'health-bar', 'sprint-bar', 'weapon', 'ammo', 'speed', 'crosshair',
    'message', 'toast', 'banner', 'banner-title', 'banner-text', 'minimap',
    'damage-flash']) {
    els[id] = document.getElementById(id);
  }
  els._toastTimer = 0;
  els._messageTimer = 0;
  els._bannerTimer = 0;
}

function setText(id, text) {
  if (lastText[id] !== text) { lastText[id] = text; els[id].textContent = text; }
}

export function showHud() { els.hud.style.display = 'block'; }
export function toast(text) {
  setText('toast', text);
  els.toast.style.opacity = '1';
  els._toastTimer = 2.6;
}
export function showBanner(title, text) {
  setText('banner-title', title);
  setText('banner-text', text);
  els.banner.style.display = 'flex';
  els._bannerTimer = 5;
}
export function flashDamage() {
  els['damage-flash'].style.opacity = '1';
  setTimeout(() => { els['damage-flash'].style.opacity = '0'; }, 90);
}

const STAR_FULL = '★', STAR_EMPTY = '☆';
export function updateHud(dt, state) {
  const p = state.player;
  setText('money', `$${state.money.toLocaleString('en-US')}`);
  setText('objective', state.objectiveText);
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.wanted ? STAR_FULL : STAR_EMPTY;
  setText('stars', stars);
  els.stars.style.color = state.wanted > 0 ? '#ff5a4a' : 'rgba(255,255,255,0.35)';
  // The in-game clock: dusk is frozen at 19:20 for the shipped look.
  setText('clock', state.palette === 'golden' ? '17:40' : '19:20');
  setText('radio', '♪ SOLMAR FM');
  els['health-bar'].style.width = `${clamp(p.health, 0, 100)}%`;
  els['health-bar'].style.background = p.health < 30 ? '#e02a3a' : '#2ad44a';
  els['sprint-bar'].style.width = `${clamp(p.stamina, 0, 100)}%`;
  if (p.inCar) {
    setText('weapon', 'DRIVING');
    setText('ammo', '');
    setText('speed', `${Math.round(Math.abs(p.car.speed) * 3.2)} km/h`);
  } else {
    setText('weapon', state.weapon === 'pistol' ? 'PISTOL' : 'FISTS');
    setText('ammo', state.weapon === 'pistol'
      ? (state.reloadTimer > 0 ? 'RELOADING…' : `${state.ammo} / 12`) : '—');
    setText('speed', '');
  }
  els.crosshair.style.display = (!p.inCar && state.weapon === 'pistol') ? 'block' : 'none';
  if (state.mission.active && state.mission.timer > 0) {
    setText('message', `${Math.ceil(state.mission.timer)}`);
  } else if (state.courier.active) {
    setText('message', `Drop in ${Math.ceil(state.courier.timer)}s`);
  } else if (state.race.active) {
    setText('message', `Race ${Math.ceil(state.race.timer)}s`);
  } else setText('message', '');
  if (els._toastTimer > 0) {
    els._toastTimer -= dt;
    if (els._toastTimer <= 0) els.toast.style.opacity = '0';
  }
  if (els._bannerTimer > 0) {
    els._bannerTimer -= dt;
    if (els._bannerTimer <= 0) els.banner.style.display = 'none';
  }
  drawMinimap(state);
}

function drawMinimap(state) {
  const cv = els.minimap;
  if (!cv) return;
  const g = cv.getContext('2d');
  const S = cv.width, C = S / 2, scale = S / 470; // whole city in frame
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#241c36'; g.fillRect(0, 0, S, S);
  const px = (x) => C + x * scale, pz = (z) => C + z * scale;
  // Sea and beach.
  g.fillStyle = '#14425e'; g.fillRect(0, pz(248), S, S - pz(248));
  g.fillStyle = '#d9b878'; g.fillRect(0, pz(204), S, pz(248) - pz(204));
  // Roads.
  g.strokeStyle = 'rgba(200,190,230,0.4)';
  g.lineWidth = 1;
  for (let i = -200; i <= 200; i += 40) {
    g.beginPath(); g.moveTo(px(i), 0); g.lineTo(px(i), S); g.stroke();
    g.beginPath(); g.moveTo(0, pz(i)); g.lineTo(S, pz(i)); g.stroke();
  }
  const dot = (x, z, color, r) => {
    g.fillStyle = color;
    g.beginPath(); g.arc(px(x), pz(z), r, 0, Math.PI * 2); g.fill();
  };
  for (const pk of state.pickups) if (pk.kind === 'token') dot(pk.pos.x, pk.pos.z, '#ffd24a', 2);
  for (const car of state.copCars) dot(car.pos.x, car.pos.z, '#4a7aff', 2.6);
  for (const cop of state.cops) dot(cop.pos.x, cop.pos.z, '#4a7aff', 2.2);
  for (const gm of state.gang) dot(gm.pos.x, gm.pos.z, '#ff4a5a', 2.6);
  if (state.mission.target && state.mission.active) {
    const t = state.mission.target;
    g.fillStyle = '#ffe97a';
    g.save();
    g.translate(px(t.x), pz(t.z));
    g.rotate(Math.PI / 4);
    g.fillRect(-3.4, -3.4, 6.8, 6.8);
    g.restore();
  }
  // The player arrow, rotated to his heading.
  const p = state.player;
  g.save();
  g.translate(px(p.pos.x), pz(p.pos.z));
  g.rotate(p.heading);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -5); g.lineTo(3.6, 4); g.lineTo(-3.6, 4);
  g.closePath(); g.fill();
  g.restore();
  g.restore();
}
