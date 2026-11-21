// peds.js — the pedestrians of Solmar City.
//
// Twenty-eight walkers who mind their own business until the city stops
// letting them. Each ped picks a sidewalk point, strolls to it, picks
// another. When danger comes close — a speeding car, gunfire, a wanted
// player — they break into a run directly away from it, arms swinging.
// Bodies are simple capsule-ish figures: legs and arms as thin boxes
// pivoting at the hip and shoulder, a torso, a head. Cheap to build,
// easy to read at distance, and the swing sells the walk.
import * as THREE from 'three';
import { rng, randRange, randPick, clamp } from './utils.js';
import { collideCircle } from './city.js';

const shirtColors = [0xe05a7a, 0x5a8ae0, 0x7ae05a, 0xe0c85a, 0xb05ae0, 0x5ae0d4, 0xe07a3b, 0xd8d8e0];

function buildPedMesh(shirt) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: shirt });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a878 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c2c38 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), mat);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 1.72;
  g.add(head);
  const limbs = {};
  for (const [name, x, y, len, m] of [
    ['armL', -0.42, 1.42, 0.62, mat], ['armR', 0.42, 1.42, 0.62, mat],
    ['legL', -0.16, 0.74, 0.74, dark], ['legR', 0.16, 0.74, 0.74, dark],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.17, len, 0.17), m);
    box.position.y = -len / 2;
    pivot.add(box);
    g.add(pivot);
    limbs[name] = pivot;
  }
  g.userData.limbs = limbs;
  return g;
}

// Sidewalk points hug the block edges: offset 8.5 from a road centreline
// puts a walker on the pavement, never in a lane or inside a building.
function sidewalkPoint() {
  const line = -200 + Math.floor(rng() * 11) * 40;
  const along = randRange(-196, 196);
  return rng() > 0.5 ? { x: line + 8.5, z: along } : { x: along, z: line + 8.5 };
}

export function spawnPeds(scene, state) {
  for (let i = 0; i < 28; i++) {
    const at = sidewalkPoint();
    const mesh = buildPedMesh(randPick(shirtColors));
    mesh.position.set(at.x, 0, at.z);
    scene.add(mesh);
    state.peds.push({
      mesh, pos: mesh.position,
      heading: randRange(0, Math.PI * 2),
      target: sidewalkPoint(),
      speed: 0, panic: 0, swing: randRange(0, 6),
      health: 40, alive: true,
    });
  }
}

export function updatePeds(dt, state) {
  const p = state.player;
  for (const ped of state.peds) {
    if (!ped.alive) continue;
    // Danger sense: the player sprinting/driving fast nearby, or any
    // recent gunshot, flips a ped into panic for a few seconds.
    const dxp = ped.pos.x - p.pos.x, dzp = ped.pos.z - p.pos.z;
    const distPlayer = Math.sqrt(dxp * dxp + dzp * dzp);
    const threat = (state.gunfireTimer > 0 && distPlayer < 26) ||
      (p.inCar && Math.abs(p.car.speed) > 16 && distPlayer < 10) ||
      (state.wanted >= 3 && distPlayer < 12);
    if (threat) ped.panic = 3.2;
    if (ped.panic > 0) ped.panic -= dt;

    let tx, tz, wantSpeed;
    if (ped.panic > 0) {
      // Run directly away from the player.
      const d = Math.max(1, distPlayer);
      tx = ped.pos.x + (dxp / d) * 20;
      tz = ped.pos.z + (dzp / d) * 20;
      wantSpeed = 5.6;
    } else {
      tx = ped.target.x; tz = ped.target.z;
      wantSpeed = 1.7;
      if (Math.abs(tx - ped.pos.x) < 1.4 && Math.abs(tz - ped.pos.z) < 1.4) ped.target = sidewalkPoint();
    }
    const dx = tx - ped.pos.x, dz = tz - ped.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.2) {
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - ped.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      ped.heading += clamp(dh, -3.4 * dt, 3.4 * dt);
    }
    ped.speed += clamp(wantSpeed - ped.speed, -8 * dt, 8 * dt);
    ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
    collideCircle(ped.pos, 0.5);
    ped.mesh.position.copy(ped.pos);
    ped.mesh.rotation.y = ped.heading;
    // Limb swing, faster and wider the faster the ped moves.
    ped.swing += dt * (3 + ped.speed * 2.4);
    const amp = clamp(ped.speed * 0.16, 0, 0.85);
    const L = ped.mesh.userData.limbs;
    L.legL.rotation.x = Math.sin(ped.swing) * amp;
    L.legR.rotation.x = -Math.sin(ped.swing) * amp;
    L.armL.rotation.x = -Math.sin(ped.swing) * amp * 0.8;
    L.armR.rotation.x = Math.sin(ped.swing) * amp * 0.8;
  }
}

export function killPed(ped, state) {
  if (!ped.alive) return;
  ped.alive = false;
  ped.mesh.rotation.x = Math.PI / 2;
  ped.mesh.position.y = 0.25;
  state.effects.blood(ped.pos.x, 0.8, ped.pos.z, 10);
}
