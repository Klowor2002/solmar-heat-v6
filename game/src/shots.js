// shots.js — the four staged screenshot scenes.
//
// Each scene is deterministic: the world is re-seeded, the actors are
// placed by hand, the simulation runs exactly 150 fixed steps of 1/60,
// and then the frame freezes. Same seed, same steps, same picture — on
// every machine, every run. When the frame is staged the document title
// becomes SHOT-READY and the #debug element carries a verification
// readout (positions, wanted level, error count) for the capture script
// to check; the shipped screenshots are taken without &debug=1, so none
// of that appears in them.
//
//   cover   — a four-star chase down the central avenue.
//   street  — on foot in the Old Town, the first job's marker ahead.
//   mission — the Vulture alley shootout, pistol drawn.
//   city    — the whole grid from the air, tower and sea included.
import { makeCar } from './vehicles.js';
import { spawnGang } from './combat.js';
import { showMarker } from './missions.js';
import { updateCamera } from './player.js';
import * as hud from './hud.js';

export const SHOT_NAMES = ['cover', 'street', 'mission', 'city'];
const PRE_STEPS = 150;
const STEP = 1 / 60;

function placePlayerCar(state, car, x, z, heading, speed) {
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.speed = speed;
  car.driver = 'player';
  state.player.inCar = true;
  state.player.car = car;
  state.player.pos.copy(car.pos);
  state.player.mesh.visible = false;
  state.camMode = 'car';
}

function addShotCop(state, x, z, speed) {
  const car = makeCar('cop', 0xffffff, x, z, 0);
  car.driver = 'cop';
  car.speed = speed;
  state.scene.add(car.mesh);
  state.copCars.push(car);
  state.allCars.push(car);
  return car;
}

export function stageShot(state, name) {
  const p = state.player;
  state.shotName = name;
  state.shotCamera = null;
  if (name === 'cover') {
    placePlayerCar(state, state.comet, 0, 60, 0, 24);
    addShotCop(state, 2, 54, 24);
    addShotCop(state, -2, 50, 23.2);
    state.wanted = 3;
    state.mission.active = true;
    state.mission.index = 3;
    state.mission.stage = 'escape';
    state.mission.timer = 45;
    state.setObjective('The Getaway — reach the safehouse before the timer runs out');
    state.shotCamera = { pos: [0, 3.6, 130], look: [0, 1.5, 106] };
  } else if (name === 'street') {
    p.pos.set(-40, 0, 116);
    p.heading = 0;
    p.camYaw = Math.PI;
    p.mesh.visible = true;
    state.mission.active = true;
    state.mission.index = 0;
    state.mission.stage = 'go';
    state.mission.target = { x: -40, z: 120 };
    showMarker(-40, 120);
    state.setObjective('Go to the Old Town alley, Mona has work');
  } else if (name === 'mission') {
    p.pos.set(-33, 0, 116);
    p.heading = -0.37;               // facing the gang at (-40, 134)
    p.camYaw = Math.PI - 0.37;
    p.mesh.visible = true;
    state.weapon = 'pistol';
    state.ammo = 12;
    state.wanted = 2;
    state.mission.active = true;
    state.mission.index = 2;
    state.mission.stage = 'kill';
    state.mission.killed = 0;
    state.mission.need = 4;
    state.mission.target = { x: -40, z: 132 };
    spawnGang(state, -38, 129, 4);
    state.setObjective('Clear out the Vultures — 0 of 4');
    // Clear traffic out of the alley's sightlines so nothing wanders
    // between the camera and the fight.
    for (const car of state.traffic) {
      const dx = car.pos.x + 40, dz = car.pos.z - 125;
      if (dx * dx + dz * dz < 60 * 60) { car.pos.x += 160; car.pos.z += 120; }
    }
  } else if (name === 'city') {
    placePlayerCar(state, state.starterCar, 0, 180, Math.PI, 12);
    state.setObjective('Free roam — press M for the next job');
    state.shotCamera = { pos: [0, 130, -240], look: [0, 0, 120] };
  }
  // Pre-simulate the staged world, then freeze it for the capture.
  for (let i = 0; i < PRE_STEPS; i++) stepShot(state, STEP);
  state.frozen = true;
  if (state.shotCamera) {
    state.camera.position.set(...state.shotCamera.pos);
    state.camera.lookAt(...state.shotCamera.look);
  } else {
    // No fixed camera: settle the chase camera behind the player once,
    // or the frame would render from wherever the camera booted.
    state.camMode = state.player.inCar ? 'car' : 'foot';
    updateCamera(state, 0.016);
  }
  // The HUD only refreshes inside the live step loop, which a frozen
  // scene never runs — refresh it once here so stars, objective and the
  // minimap show the staged state, then clear the centre timer text.
  hud.updateHud(0, state);
  const msg = document.getElementById('message');
  if (msg) msg.textContent = '';
  document.title = 'SHOT-READY';
  const dbg = document.getElementById('debug');
  if (dbg && new URLSearchParams(location.search).has('debug')) {
    dbg.style.display = 'block';
    const cops = state.copCars.map((c) => `${c.pos.x.toFixed(1)},${c.pos.z.toFixed(1)}`).join(' | ');
    dbg.textContent =
      `shot=${name} player=${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)} wanted=${state.wanted}\n` +
      `cops=${cops} gang=${state.gang.length} errors=${state.errors.length}\n` +
      (state.errors.length ? state.errors.join('\n') : 'no errors');
  }
}

// The reduced simulation a staged scene runs: the player's car cruises
// straight, staged cops chase, traffic and peds keep moving, the gang
// closes in. No input, no missions, no wanted bookkeeping — the scene
// was composed by hand and the steps only settle it into motion.
export function stepShot(state, dt) {
  const p = state.player;
  if (p.inCar && p.car) {
    p.car.pos.x += Math.sin(p.car.heading) * p.car.speed * dt;
    p.car.pos.z += Math.cos(p.car.heading) * p.car.speed * dt;
    p.car.mesh.position.copy(p.car.pos);
    p.car.mesh.rotation.y = p.car.heading;
    p.pos.copy(p.car.pos);
  }
  for (const car of state.copCars) {
    const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
    const want = Math.atan2(dx, dz);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
  }
  state.updateTrafficOnly(dt);
  state.updatePedsOnly(dt);
  state.updateGangOnly(dt);
  state.effects.update(dt);
}
