// missions.js — the story of Solmar Heat, plus everything else that
// pays.
//
// Eight story jobs, in order, each completable with the systems the rest
// of the game provides — driving, stealing, shooting, escaping:
//
//   1. First Pickup    — walk to Mona's package and pick it up.      $200
//   2. Hot Wheels      — steal the red Comet GT, fence it yourself
//                        by delivering it to the Chop Shop.         $350
//   3. Vulture Trouble — clear four Vultures out of the Old Town
//                        alley.                                     $500
//   4. The Getaway     — survive sixty seconds at three stars.      $600
//   5. Dockside Deal   — a pier meet that goes loud: two waves.     $800
//   6. Safehouse Siege — defend Mona's Garage, two waves.           $900
//   7. Night Run       — a timed drive, garage to bank, 90 seconds. $1000
//   8. The Big Score   — lift three bags from Solmar Bank, escape
//                        at four stars, reach the garage.           $1500
//
// Around the story: courier runs (T), a five-checkpoint street race (G
// while driving), ten hidden Solmar tokens, the Chop Shop's standing
// offer to fence any stolen car, and the hospital's health pack.
import * as THREE from 'three';
import { randRange, clamp } from './utils.js';
import { spawnGang, dropPickup } from './combat.js';

export const CHOP_SHOP = { x: -160, z: 160 };
export const GARAGE = { x: -120, z: -120 };
export const BANK = { x: 0, z: 14 };
export const HOSPITAL = { x: -60, z: 68 };

const TOKEN_SPOTS = [
  [-40, 116], [80, -40], [-160, -40], [40, 200], [120, 262],
  [-200 + 14, 40], [160, -160], [0, -200 + 14], [-80, 120], [200 - 14, -120],
];

export const STORY = [
  { name: 'First Pickup', pay: 200 },
  { name: 'Hot Wheels', pay: 350 },
  { name: 'Vulture Trouble', pay: 500 },
  { name: 'The Getaway', pay: 600 },
  { name: 'Dockside Deal', pay: 800 },
  { name: 'Safehouse Siege', pay: 900 },
  { name: 'Night Run', pay: 1000 },
  { name: 'The Big Score', pay: 1500 },
];

// The objective marker: a golden diamond floating over a light beam, so
// the current goal reads from anywhere in the city.
let markerMesh = null, beamMesh = null;
export function buildMarker(scene) {
  markerMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 26, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  markerMesh.visible = beamMesh.visible = false;
  scene.add(markerMesh); scene.add(beamMesh);
}
export function showMarker(x, z) {
  markerMesh.position.set(x, 6, z);
  beamMesh.position.set(x, 13, z);
  markerMesh.visible = beamMesh.visible = true;
}
export function hideMarker() {
  markerMesh.visible = beamMesh.visible = false;
}

export function initMissions(state) {
  state.mission = { active: false, index: 0, stage: '', timer: 0, killed: 0, need: 0, target: null, wave: 0, bags: 0 };
  state.courier = { active: false, timer: 0, target: null };
  state.race = { active: false, timer: 0, next: 0, points: [] };
  state.tokensFound = state.tokensFound || Array(10).fill(false);
  state.hospitalTimer = 0;
  // Lay the tokens that have not been found yet.
  TOKEN_SPOTS.forEach(([x, z], i) => {
    if (!state.tokensFound[i]) {
      const before = state.pickups.length;
      dropPickup(state, x, z, 'token', 25);
      state.pickups[before].tokenIndex = i;
    }
  });
}

function startMission(state, index) {
  const m = state.mission;
  m.active = true; m.index = index; m.killed = 0; m.wave = 0; m.bags = 0;
  const p = state.player;
  switch (index) {
    case 0:
      m.stage = 'go'; m.target = { x: -40, z: 120 };
      state.setObjective('Go to the Old Town alley — Mona has work');
      break;
    case 1:
      m.stage = 'steal'; m.target = { x: state.comet.pos.x, z: state.comet.pos.z };
      state.setObjective('Steal the red Comet GT');
      break;
    case 2:
      m.stage = 'kill'; m.need = 4; m.target = { x: -40, z: 132 };
      spawnGang(state, -40, 134, 4);
      state.setObjective('Clear out the Vultures — 0 of 4');
      break;
    case 3:
      m.stage = 'escape'; m.timer = 60;
      state.setWanted(3);
      state.setObjective('The Getaway — survive the heat for 60 seconds');
      break;
    case 4:
      m.stage = 'go'; m.target = { x: 120, z: 238 };
      state.setObjective('Meet the buyer at the end of the pier');
      break;
    case 5:
      m.stage = 'go'; m.target = { x: GARAGE.x, z: GARAGE.z + 12 };
      state.setObjective('Get back to Mona\'s Garage — trouble is coming');
      break;
    case 6:
      m.stage = 'drive'; m.timer = 90; m.target = { x: BANK.x, z: BANK.z };
      state.setObjective('Night Run — reach Solmar Bank before the clock dies');
      break;
    case 7:
      m.stage = 'bags'; m.target = { x: BANK.x, z: BANK.z };
      state.setObjective('The Big Score — grab three bags from the Bank');
      break;
  }
  if (m.target) showMarker(m.target.x, m.target.z);
  state.toast(`Mission: ${STORY[index].name}`);
}

function completeMission(state) {
  const m = state.mission;
  const pay = STORY[m.index].pay;
  state.addMoney(pay);
  state.audioMissionDone = true;
  state.missionsDone = Math.max(state.missionsDone, m.index + 1);
  state.toast(`${STORY[m.index].name} complete — +$${pay}`);
  m.active = false;
  hideMarker();
  if (m.index === 7) {
    state.storyDone = true;
    state.showBanner('SOLMAR HEAT', 'Jax is out. The city keeps the change. Free roam — the night is yours.');
    state.setObjective('Story complete — free roam. Press M for side work, T for courier runs');
  } else {
    state.setObjective(`Press M for the next job: ${STORY[m.index + 1].name}`);
  }
  state.saveNow();
}

function failMission(state, why) {
  state.mission.active = false;
  hideMarker();
  state.toast(`Mission failed — ${why}. Press M to retry`);
  state.setObjective('Press M to retry the mission');
}

export function updateMissions(dt, state) {
  const m = state.mission;
  const p = state.player;
  if (markerMesh && markerMesh.visible) {
    markerMesh.rotation.y += dt * 1.8;
    markerMesh.position.y = 6 + Math.sin(state.time * 2.2) * 0.5;
  }
  // Hospital pack: a fresh one every thirty seconds, if none is waiting.
  state.hospitalTimer -= dt;
  if (state.hospitalTimer <= 0) {
    state.hospitalTimer = 30;
    const waiting = state.pickups.some((pk) => pk.kind === 'health' && pk.hospital);
    if (!waiting) {
      const before = state.pickups.length;
      dropPickup(state, HOSPITAL.x, HOSPITAL.z, 'health', 40);
      state.pickups[before].hospital = true;
    }
  }

  // Chop Shop fencing: roll any car you stole (not your starter, not one
  // already fenced) into the shop's yard and it becomes cash.
  if (p.inCar && p.car && !p.car.fenced && !p.car.isStarter) {
    const dx = p.pos.x - CHOP_SHOP.x, dz = p.pos.z - CHOP_SHOP.z;
    if (dx * dx + dz * dz < 130) {
      if (m.active && m.index === 1 && p.car.isComet) {
        // The story delivery pays through the mission, not the fence.
      } else {
        const value = p.car.fenceValue;
        p.car.fenced = true;
        state.addMoney(value);
        state.audioCash = true;
        state.toast(`Fenced at the Chop Shop — +$${value}`);
        state.effects.sparkle(p.pos.x, 1.4, p.pos.z, 12);
      }
    }
  }

  updateCourier(dt, state);
  updateRace(dt, state);
  if (!m.active) return;

  const distTo = (t) => Math.sqrt((p.pos.x - t.x) ** 2 + (p.pos.z - t.z) ** 2);
  switch (m.index) {
    case 0:
      if (distTo(m.target) < 3.4) completeMission(state);
      break;
    case 1:
      if (m.stage === 'steal') {
        m.target = { x: state.comet.pos.x, z: state.comet.pos.z };
        showMarker(m.target.x, m.target.z);
        if (p.inCar && p.car === state.comet) {
          m.stage = 'deliver'; m.target = { x: CHOP_SHOP.x, z: CHOP_SHOP.z };
          showMarker(m.target.x, m.target.z);
          state.setObjective('Deliver the Comet to the Chop Shop');
        }
      } else if (m.stage === 'deliver' && distTo(m.target) < 11) {
        completeMission(state);
      }
      break;
    case 2:
      m.killed = m.need - state.gang.length;
      state.setObjective(`Clear out the Vultures — ${m.killed} of ${m.need}`);
      if (state.gang.length === 0) completeMission(state);
      break;
    case 3:
      m.timer -= dt;
      state.setObjective(`The Getaway — survive the heat for ${Math.ceil(m.timer)} seconds`);
      if (m.timer <= 0) { state.setWanted(0); completeMission(state); }
      break;
    case 4:
      if (m.stage === 'go' && distTo(m.target) < 4) {
        m.stage = 'fight'; m.wave = 1; m.need = 3;
        spawnGang(state, 120, 226, 3);
        state.setObjective('The deal went loud — clear the pier, wave 1');
        hideMarker();
      } else if (m.stage === 'fight' && state.gang.length === 0) {
        if (m.wave === 1) {
          m.wave = 2;
          spawnGang(state, 112, 218, 3);
          state.setObjective('More Vultures — wave 2');
        } else completeMission(state);
      }
      break;
    case 5:
      if (m.stage === 'go' && distTo(m.target) < 6) {
        m.stage = 'fight'; m.wave = 1;
        spawnGang(state, GARAGE.x + 16, GARAGE.z + 18, 3);
        state.setObjective('Defend the garage — wave 1');
        hideMarker();
      } else if (m.stage === 'fight' && state.gang.length === 0) {
        if (m.wave === 1) {
          m.wave = 2;
          spawnGang(state, GARAGE.x - 18, GARAGE.z + 10, 3);
          state.setObjective('Defend the garage — wave 2');
        } else completeMission(state);
      }
      break;
    case 6:
      m.timer -= dt;
      state.setObjective(`Night Run — reach the Bank in ${Math.ceil(m.timer)} seconds`);
      if (distTo(m.target) < 9) completeMission(state);
      else if (m.timer <= 0) failMission(state, 'the window closed');
      break;
    case 7:
      if (m.stage === 'bags') {
        // One bag at a time: a short pause between lifts, like filling
        // them, so standing in the vault does not grab all three at once.
        if (m.bagWait > 0) m.bagWait -= dt;
        if (distTo(m.target) < 8 && m.bags < 3 && (m.bagWait || 0) <= 0) {
          m.bags++;
          state.audioPickup = true;
          state.toast(`Bag ${m.bags} of 3 lifted`);
          if (m.bags >= 3) {
            m.stage = 'escape';
            state.setWanted(4);
            m.target = { x: GARAGE.x, z: GARAGE.z };
            showMarker(m.target.x, m.target.z);
            state.setObjective('Now run — reach Mona\'s Garage');
          } else {
            state.setObjective(`The Big Score — bags: ${m.bags} of 3 (stay at the Bank)`);
            m.bagWait = 1.6;
          }
        }
      } else if (m.stage === 'escape' && distTo(m.target) < 10) {
        state.setWanted(0);
        completeMission(state);
      }
      break;
  }
}

// Courier runs: after the first story job, T starts a timed drop to a
// random intersection. Small money, always available, no story strings.
function updateCourier(dt, state) {
  const c = state.courier;
  if (!c.active) return;
  c.timer -= dt;
  const p = state.player;
  const d = Math.sqrt((p.pos.x - c.target.x) ** 2 + (p.pos.z - c.target.z) ** 2);
  if (d < 5) {
    c.active = false;
    state.addMoney(80);
    state.audioCash = true;
    state.toast('Courier drop delivered — +$80');
    if (!state.mission.active) { hideMarker(); state.setObjective('Press M for the next job, T for another drop'); }
    return;
  }
  if (c.timer <= 0) {
    c.active = false;
    state.toast('Courier drop expired');
    if (!state.mission.active) hideMarker();
  }
}

export function startCourier(state) {
  if (state.missionsDone < 1 || state.courier.active || state.mission.active) return;
  const lines = [-160, -80, 0, 80, 160];
  const target = { x: lines[Math.floor(randRange(0, 5))], z: lines[Math.floor(randRange(0, 5))] };
  state.courier = { active: true, timer: 75, target };
  showMarker(target.x, target.z);
  state.setObjective('Courier drop — reach the marker in 75 seconds');
  state.toast('Courier run started');
}

// The street race: five checkpoints around the grid, 100 seconds, only
// while driving. Checkpoints reuse the mission marker one at a time.
const RACE_POINTS = [[0, 180], [160, 80], [80, -120], [-120, -80], [-40, 120]];
export function startRace(state) {
  if (!state.player.inCar || state.race.active || state.mission.active) return;
  state.race = { active: true, timer: 100, next: 0, points: RACE_POINTS };
  showMarker(RACE_POINTS[0][0], RACE_POINTS[0][1]);
  state.setObjective('Street race — checkpoint 1 of 5');
  state.toast('Race started — follow the gold');
}
function updateRace(dt, state) {
  const r = state.race;
  if (!r.active) return;
  r.timer -= dt;
  const [tx, tz] = r.points[r.next];
  const p = state.player;
  const d = Math.sqrt((p.pos.x - tx) ** 2 + (p.pos.z - tz) ** 2);
  if (d < 9) {
    r.next++;
    state.audioPickup = true;
    if (r.next >= r.points.length) {
      r.active = false;
      state.addMoney(150);
      state.toast('Race won — +$150');
      hideMarker();
      state.setObjective('Press M for the next job, G for another race');
      return;
    }
    showMarker(r.points[r.next][0], r.points[r.next][1]);
    state.setObjective(`Street race — checkpoint ${r.next + 1} of 5`);
  }
  if (r.timer <= 0) {
    r.active = false;
    hideMarker();
    state.toast('Race timed out');
  }
}

export function requestMission(state) {
  if (state.mission.active) { state.toast('Finish the current job first'); return; }
  if (state.missionsDone >= 8) {
    state.toast('The story is done — the city is yours');
    return;
  }
  startMission(state, state.missionsDone);
}
