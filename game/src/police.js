// police.js — the Solmar police and the wanted system.
//
// Wanted runs 0 to 5 stars. Crimes the police witness raise it; hiding
// from every cop's eyes for nine seconds lets it decay, one star at a
// time. The response scales with the heat: at one or two stars foot cops
// chase and try to hold an arrest — three seconds in arm's reach and the
// night ends BUSTED. At three stars the foot cops draw and shoot, and
// interceptor cars join in and ram. Cops spawn at road intersections
// near the player, never inside a building, and give up cleanly when
// the wanted level reaches zero.
import * as THREE from 'three';
import { clamp, randRange } from './utils.js';
import { collideCircle } from './city.js';
import { buildCarMesh, makeCar, finishCarFrame } from './vehicles.js';
import { buildPlayerMesh } from './player.js';

function buildCopMesh() {
  const g = buildPlayerMesh();
  // Recolour the jacket navy so cops read instantly at distance.
  g.children[0].material = new THREE.MeshLambertMaterial({ color: 0x24408c });
  return g;
}

export function initPolice(state) {
  state.wanted = 0;
  state.wantedDecay = 0;      // seconds since a cop last saw the player
  state.arrestTimer = 0;
  state.cops = [];            // foot cops
  state.copCars = [];         // interceptor cars (also in allCars? no — kept apart)
  state.seenByPolice = false;
}

export function policeSeePlayer(state) {
  const p = state.player;
  for (const cop of state.cops) {
    const dx = p.pos.x - cop.pos.x, dz = p.pos.z - cop.pos.z;
    if (dx * dx + dz * dz < 34 * 34) return true;
  }
  for (const car of state.copCars) {
    const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
    if (dx * dx + dz * dz < 40 * 40) return true;
  }
  return state.wanted > 0 && state.wantedDecay < 2;
}

function spawnPointNear(state) {
  // A road intersection 45–70 units from the player, clamped to the grid.
  const p = state.player;
  const ang = randRange(0, Math.PI * 2);
  const dist = randRange(45, 70);
  let x = Math.round((p.pos.x + Math.cos(ang) * dist) / 40) * 40;
  let z = Math.round((p.pos.z + Math.sin(ang) * dist) / 40) * 40;
  x = clamp(x, -200, 200); z = clamp(z, -200, 200);
  return { x, z };
}

function desiredCops(state) {
  return [0, 2, 3, 4, 5, 6][state.wanted] || 0;
}
function desiredCars(state) {
  return state.wanted >= 3 ? state.wanted - 2 : 0;
}

export function updatePolice(dt, state) {
  const p = state.player;
  state.seenByPolice = policeSeePlayer(state);
  if (state.wanted > 0) {
    if (state.seenByPolice) state.wantedDecay = 0;
    else {
      state.wantedDecay += dt;
      if (state.wantedDecay > 9) {
        state.wantedDecay = 0;
        state.setWanted(state.wanted - 1);
        if (state.wanted === 0) state.toast('You lost the heat');
      }
    }
  }

  // Spawn or retire foot cops to match the wanted level.
  while (state.cops.length < desiredCops(state)) {
    const at = spawnPointNear(state);
    const mesh = buildCopMesh();
    mesh.position.set(at.x, 0, at.z);
    state.scene.add(mesh);
    state.cops.push({
      mesh, pos: mesh.position, heading: 0, health: 100, alive: true,
      shootCd: randRange(0.4, 1.2), swing: randRange(0, 6), punchCd: 0,
    });
  }
  while (state.cops.length > desiredCops(state)) {
    const cop = state.cops.pop();
    state.scene.remove(cop.mesh);
  }
  // Same for interceptor cars.
  while (state.copCars.length < desiredCars(state)) {
    const at = spawnPointNear(state);
    const car = makeCar('cop', 0xffffff, at.x, at.z, 0);
    car.driver = 'cop';
    state.scene.add(car.mesh);
    state.copCars.push(car);
    state.allCars.push(car);
  }
  while (state.copCars.length > desiredCars(state)) {
    const car = state.copCars.pop();
    state.scene.remove(car.mesh);
    const i = state.allCars.indexOf(car);
    if (i >= 0) state.allCars.splice(i, 1);
  }

  state.arrestTimer = Math.max(0, state.arrestTimer - dt * 0.5);
  for (const cop of state.cops) {
    if (!cop.alive) continue;
    const dx = p.pos.x - cop.pos.x, dz = p.pos.z - cop.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cop.heading += clamp(dh, -4 * dt, 4 * dt);
    const speed = dist > 2.2 ? (state.wanted >= 3 ? 5.4 : 6.4) : 0;
    cop.pos.x += Math.sin(cop.heading) * speed * dt;
    cop.pos.z += Math.cos(cop.heading) * speed * dt;
    collideCircle(cop.pos, 0.55);
    cop.mesh.position.copy(cop.pos);
    cop.mesh.rotation.y = cop.heading;
    cop.swing += dt * 11;
    const L = cop.mesh.userData.limbs;
    if (L) {
      const amp = speed > 0 ? 0.6 : 0;
      L.legL.rotation.x = Math.sin(cop.swing) * amp;
      L.legR.rotation.x = -Math.sin(cop.swing) * amp;
    }
    if (dist < 2.3) {
      if (state.wanted <= 2) {
        // The arrest hold: stay close and the cuffs come out.
        state.arrestTimer += dt * 2;
        if (state.arrestTimer >= 3) state.endGame('busted');
      } else {
        // High heat: cops shove and shoot instead of arresting.
        cop.punchCd -= dt;
        if (cop.punchCd <= 0) { cop.punchCd = 0.9; state.damagePlayer(6, cop.pos); }
      }
    }
    if (state.wanted >= 3 && dist < 30 && dist > 3) {
      cop.shootCd -= dt;
      if (cop.shootCd <= 0) {
        cop.shootCd = randRange(0.8, 1.5);
        state.enemyShoot(cop.pos, 9);
      }
    }
  }

  // Interceptors: steer at the player's car (or the player), ram on
  // contact, and box him in by aiming slightly ahead of his motion.
  for (const car of state.copCars) {
    const target = p.inCar ? p.car : null;
    const tx = target ? target.pos.x : p.pos.x;
    const tz = target ? target.pos.z : p.pos.z;
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += clamp(dh, -1.7 * dt, 1.7 * dt);
    const want = dist > 6 ? car.topSpeed : car.topSpeed * 0.4;
    car.speed += clamp(want - car.speed, -26 * dt, 13 * dt);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    collideCircle(car.pos, 2.1);
    finishCarFrame(car, dt);
  }
  state.sirenActive = state.copCars.length > 0;
}

export function killCop(cop, state) {
  if (!cop.alive) return;
  cop.alive = false;
  cop.mesh.rotation.x = Math.PI / 2;
  cop.mesh.position.y = 0.25;
  state.effects.blood(cop.pos.x, 0.8, cop.pos.z, 10);
  const i = state.cops.indexOf(cop);
  if (i >= 0) state.cops.splice(i, 1);
  // Killing an officer is the loudest crime there is.
  state.commitCrime(2, 'cop');
}
