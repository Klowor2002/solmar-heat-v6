// combat.js — fists, the pistol, the Vultures, and what falls out of
// people when they lose.
//
// Shooting is hitscan: a ray from the camera through the crosshair,
// tested against simple distance-to-segment checks on every hittable —
// gang members, cops, pedestrians, cars. The pistol holds twelve rounds,
// fires every 0.22 seconds, deals 34 damage out to 70 units. Enemies
// have 100 health, close to about sixteen units, strafe, and shoot back
// with honest inaccuracy. Kills drop cash pickups; some drop health.
import * as THREE from 'three';
import { randRange, clamp } from './utils.js';
import { collideCircle } from './city.js';
import { buildPlayerMesh } from './player.js';
import { killPed } from './peds.js';
import { killCop } from './police.js';

export function initCombat(state) {
  state.weapon = 'fists';       // 'fists' | 'pistol'
  state.ammo = 12;
  state.reloadTimer = 0;
  state.fireCd = 0;
  state.gang = [];              // live Vulture members
  state.pickups = [];           // {mesh, kind, value, pos}
  state.gunfireTimer = 0;
  state.tracer = null;
}

function buildGangMesh() {
  const g = buildPlayerMesh();
  g.children[0].material = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.38),
    new THREE.MeshLambertMaterial({ color: 0xd8b83b }));
  mask.position.y = 1.78;
  g.add(mask);
  return g;
}

export function spawnGang(state, x, z, count) {
  for (let i = 0; i < count; i++) {
    const mesh = buildGangMesh();
    const gx = x + randRange(-6, 6), gz = z + randRange(-6, 6);
    mesh.position.set(gx, 0, gz);
    state.scene.add(mesh);
    state.gang.push({
      mesh, pos: mesh.position, heading: 0, health: 100, alive: true,
      shootCd: randRange(0.6, 1.6), strafeDir: i % 2 === 0 ? 1 : -1, swing: 0,
    });
  }
}

export function dropPickup(state, x, z, kind, value) {
  const color = kind === 'cash' ? 0x2ee06a : kind === 'health' ? 0xff5a6a : 0xffd24a;
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.55),
    new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(x, 1.1, z);
  state.scene.add(mesh);
  state.pickups.push({ mesh, pos: mesh.position, kind, value, spin: randRange(0, 6) });
}

// Distance from a point to the shot segment, for the hitscan test.
function segmentDistance(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const t = clamp(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) /
    (abx * abx + aby * aby + abz * abz), 0, 1);
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function playerShoot(state) {
  const p = state.player;
  if (state.weapon === 'fists') {
    // A punch: anything alive within two units in front takes a hit.
    for (const list of [state.gang, state.cops, state.peds]) {
      for (const who of list) {
        if (!who.alive) continue;
        const dx = who.pos.x - p.pos.x, dz = who.pos.z - p.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const facing = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
        if (d < 2.2 && facing > 0) { hurt(state, who, 22); return; }
      }
    }
    return;
  }
  if (state.ammo <= 0) { state.toast('Empty — R to reload'); return; }
  state.ammo--;
  state.fireCd = 0.22;
  state.gunfireTimer = 1.2;
  state.audioShoot = true;
  if (state.policeSeePlayer()) state.commitCrime(1, 'shots-fired');

  const cam = state.camera;
  const origin = cam.position.clone();
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const end = origin.clone().add(dir.multiplyScalar(70));
  // Muzzle flash: a brief spark burst where the gun is.
  state.effects.sparks(p.pos.x + Math.sin(p.heading) * 0.6, 1.35, p.pos.z + Math.cos(p.heading) * 0.6, 3);

  let best = null, bestDist = 1e9;
  const test = (who, radius, height) => {
    if (!who.alive && who.health !== undefined) return;
    const d = segmentDistance(who.pos.x, height, who.pos.z,
      origin.x, origin.y, origin.z, end.x, end.y, end.z);
    if (d < radius) {
      const along = Math.sqrt((who.pos.x - origin.x) ** 2 + (who.pos.z - origin.z) ** 2);
      if (along < bestDist) { bestDist = along; best = who; }
    }
  };
  for (const g of state.gang) test(g, 0.85, 1.1);
  for (const c of state.cops) test(c, 0.85, 1.1);
  for (const pd of state.peds) test(pd, 0.8, 1.1);
  if (best) hurt(state, best, 34);
}

function hurt(state, who, dmg) {
  who.health -= dmg;
  state.effects.blood(who.pos.x, 1.2, who.pos.z, 5);
  if (who.health > 0) return;
  // Death. Which list the body belongs to decides the consequences.
  if (state.gang.includes(who)) {
    who.alive = false;
    who.mesh.rotation.x = Math.PI / 2;
    who.mesh.position.y = 0.25;
    state.gang.splice(state.gang.indexOf(who), 1);
    dropPickup(state, who.pos.x, who.pos.z, 'cash', 30 + Math.floor(randRange(0, 50)));
    if (randRange(0, 1) > 0.55) dropPickup(state, who.pos.x + 1.5, who.pos.z, 'health', 30);
    state.onGangKilled(who);
    if (state.policeSeePlayer()) state.commitCrime(1, 'gang-kill');
  } else if (state.cops.includes(who)) {
    killCop(who, state);
  } else {
    killPed(who, state);
    if (state.policeSeePlayer()) state.commitCrime(2, 'ped-kill');
    state.toast('That was a civilian…');
  }
}

// An enemy (cop or Vulture) fires at the player: a damage roll softened
// by distance, with a tracer spark so the player can read the direction.
export function enemyShootAt(state, fromPos, damage) {
  const p = state.player;
  const dx = p.pos.x - fromPos.x, dz = p.pos.z - fromPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  state.effects.sparks(fromPos.x, 1.4, fromPos.z, 2);
  const hitChance = clamp(0.62 - dist * 0.012, 0.12, 0.6);
  if (Math.random() < hitChance) state.damagePlayer(damage, fromPos);
}

export function updateCombat(dt, state) {
  state.fireCd = Math.max(0, state.fireCd - dt);
  state.gunfireTimer = Math.max(0, state.gunfireTimer - dt);
  if (state.reloadTimer > 0) {
    state.reloadTimer -= dt;
    if (state.reloadTimer <= 0) state.ammo = 12;
  }
  const input = state.input;
  if (input.wasPressed('Digit1')) state.weapon = 'fists';
  if (input.wasPressed('Digit2')) state.weapon = 'pistol';
  if (input.wasPressed('KeyR') && state.weapon === 'pistol' && state.ammo < 12 && state.reloadTimer <= 0) {
    state.reloadTimer = 0.9;
    state.toast('Reloading…');
  }
  if (input.clicked && !state.player.inCar && state.fireCd <= 0 && state.reloadTimer <= 0) {
    state.input.requestLock();
    playerShoot(state);
  }

  // Vultures: close to fighting range, strafe, shoot.
  const p = state.player;
  for (const g of state.gang) {
    if (!g.alive) continue;
    const dx = p.pos.x - g.pos.x, dz = p.pos.z - g.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - g.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    g.heading += clamp(dh, -4.4 * dt, 4.4 * dt);
    let mx = 0, mz = 0;
    if (dist > 17) { mx = Math.sin(g.heading); mz = Math.cos(g.heading); }
    else if (dist < 9) { mx = -Math.sin(g.heading); mz = -Math.cos(g.heading); }
    // The strafe: sideways drift that flips every couple of seconds.
    const sx = Math.cos(g.heading) * g.strafeDir, sz = -Math.sin(g.heading) * g.strafeDir;
    if (Math.random() < dt * 0.4) g.strafeDir *= -1;
    g.pos.x += (mx * 4.6 + sx * 1.8) * dt;
    g.pos.z += (mz * 4.6 + sz * 1.8) * dt;
    collideCircle(g.pos, 0.55);
    g.mesh.position.copy(g.pos);
    g.mesh.rotation.y = g.heading;
    g.swing += dt * 10;
    const L = g.mesh.userData.limbs;
    if (L) {
      L.legL.rotation.x = Math.sin(g.swing) * 0.55;
      L.legR.rotation.x = -Math.sin(g.swing) * 0.55;
    }
    if (dist < 34) {
      g.shootCd -= dt;
      if (g.shootCd <= 0) {
        g.shootCd = randRange(0.9, 1.7);
        enemyShootAt(state, g.pos, 8);
      }
    }
  }

  // Pickups: spin, bob, and collect on touch.
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.spin += dt * 2.6;
    pk.mesh.rotation.y = pk.spin;
    pk.mesh.position.y = 1.1 + Math.sin(pk.spin * 1.7) * 0.18;
    const dx = p.pos.x - pk.pos.x, dz = p.pos.z - pk.pos.z;
    if (dx * dx + dz * dz < 3.2) {
      if (pk.kind === 'cash') { state.addMoney(pk.value); state.toast(`+$${pk.value}`); }
      if (pk.kind === 'health') { p.health = clamp(p.health + pk.value, 0, 100); state.toast('Patched up'); }
      if (pk.kind === 'token') { state.collectToken(pk.tokenIndex); }
      state.effects.sparkle(pk.pos.x, 1.2, pk.pos.z, 8);
      state.audioPickup = true;
      state.scene.remove(pk.mesh);
      state.pickups.splice(i, 1);
    }
  }
}
