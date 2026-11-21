// player.js — Jax Moreno on foot, and the camera that follows him.
//
// On foot Jax walks at 6 units a second, sprints at 9 while his stamina
// holds, and jumps with plain gravity. Movement is camera-relative: W
// always walks away from the camera, along the view direction — the
// camera sits behind him at yaw, so the offset direction is the opposite
// of where he faces. (Getting this backwards makes W walk into the
// camera; it is the one convention this file exists to get right.)
//
// E is the verb for cars: near a car it climbs in — stealing it, if it
// belongs to someone else and a cop can see, is a crime — and in a car
// it climbs out again, stepping to the side door.
import * as THREE from 'three';
import { clamp } from './utils.js';
import { collideCircle } from './city.js';
import { drivePlayerCar } from './vehicles.js';

export function buildPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xb03040 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89868 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23232e });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.36), jacket);
  torso.position.y = 1.14;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
  head.position.y = 1.76;
  g.add(head);
  const limbs = {};
  for (const [name, x, y, len, m] of [
    ['armL', -0.45, 1.44, 0.64, jacket], ['armR', 0.45, 1.44, 0.64, jacket],
    ['legL', -0.17, 0.76, 0.76, dark], ['legR', 0.17, 0.76, 0.76, dark],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, len, 0.18), m);
    box.position.y = -len / 2;
    pivot.add(box);
    g.add(pivot);
    limbs[name] = pivot;
  }
  g.userData.limbs = limbs;
  return g;
}

export function makePlayer(scene) {
  const mesh = buildPlayerMesh();
  scene.add(mesh);
  return {
    mesh, pos: mesh.position,
    heading: Math.PI,          // facing the first mission marker
    camYaw: Math.PI, camPitch: 0.16,
    vy: 0, grounded: true,
    stamina: 100, health: 100,
    inCar: false, car: null,
    swing: 0, dead: false,
  };
}

const WALK = 6, SPRINT = 9;

export function updatePlayer(dt, state) {
  const p = state.player;
  const input = state.input;
  if (p.inCar) {
    // Driving: the car module moves the car; Jax rides inside it and the
    // camera chases the car instead of the man.
    const ratio = drivePlayerCar(p.car, input, dt, state);
    p.pos.copy(p.car.pos);
    p.heading = p.car.heading;
    p.mesh.visible = false;
    state.camMode = 'car';
    state.speedRatio = ratio;
    if (input.wasPressed('KeyE')) exitCar(state);
    return;
  }
  p.mesh.visible = true;
  state.camMode = 'foot';
  state.speedRatio = 0;

  // Mouse look steers the camera yaw; Jax turns to face his movement.
  p.camYaw -= input.mouseDX * 0.0026;
  p.camPitch = clamp(p.camPitch + input.mouseDY * 0.0022, -0.12, 0.72);

  const fwd = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) -
              (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
  const strafe = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) -
                 (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
  const sprinting = input.isDown('ShiftLeft') && fwd > 0 && p.stamina > 1;
  const speed = sprinting ? SPRINT : WALK;
  p.stamina = clamp(p.stamina + (sprinting ? -26 * dt : 17 * dt), 0, 100);

  // Camera-relative wish direction: forward is away from the camera.
  const sin = Math.sin(p.camYaw), cos = Math.cos(p.camYaw);
  let mx = (-sin * fwd) + (cos * strafe);
  let mz = (-cos * fwd) + (-sin * strafe);
  const ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 0.01) {
    mx /= ml; mz /= ml;
    p.pos.x += mx * speed * dt;
    p.pos.z += mz * speed * dt;
    p.heading = Math.atan2(mx, mz);
    p.swing += dt * (sprinting ? 13 : 9.5);
  }
  // Jump and gravity.
  if (input.wasPressed('Space') && p.grounded) { p.vy = 7.6; p.grounded = false; }
  if (!p.grounded) {
    p.vy -= 21 * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
  }
  collideCircle(p.pos, 0.55);
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.heading;
  const amp = ml > 0.01 ? (sprinting ? 0.8 : 0.55) : 0;
  const L = p.mesh.userData.limbs;
  L.legL.rotation.x = Math.sin(p.swing) * amp;
  L.legR.rotation.x = -Math.sin(p.swing) * amp;
  L.armL.rotation.x = -Math.sin(p.swing) * amp * 0.75;
  L.armR.rotation.x = Math.sin(p.swing) * amp * 0.75;

  if (input.wasPressed('KeyE')) tryEnterCar(state);
}

function nearestCar(state, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of state.allCars) {
    const dx = car.pos.x - state.player.pos.x, dz = car.pos.z - state.player.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterCar(state) {
  const car = nearestCar(state, 4.2);
  if (!car) return;
  const p = state.player;
  const wasParked = car.driver === 'parked';
  const wasTraffic = car.driver === 'traffic';
  car.driver = 'player';
  p.inCar = true;
  p.car = car;
  state.audioEngine = true;
  if (wasTraffic) {
    // Dragging a driver out in the open is as public as crimes get.
    state.commitCrime(2, 'carjacking');
  } else if (wasParked && state.policeSeePlayer()) {
    state.commitCrime(1, 'theft');
  }
  state.toast(wasParked || wasTraffic ? 'Stolen — fence it at the Chop Shop' : 'Driving');
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  car.driver = 'parked';
  car.speed = 0;
  p.inCar = false;
  p.car = null;
  // Step out at the left door.
  p.pos.x = car.pos.x + Math.cos(car.heading) * -2.2;
  p.pos.z = car.pos.z - Math.sin(car.heading) * -2.2;
  p.pos.y = 0;
  collideCircle(p.pos, 0.55);
  state.audioEngine = false;
}

// The chase camera. On foot it floats 6.5 behind and 2.6 up; driving it
// drops to 9.5 behind and 3.9 up and the field of view breathes out with
// speed, which is most of what makes the driving feel fast.
export function updateCamera(state, dt) {
  const p = state.player;
  const cam = state.camera;
  if (state.camMode === 'car' && p.car) {
    const back = 9.5, up = 3.9;
    const hx = p.car.pos.x - Math.sin(p.car.heading) * back;
    const hz = p.car.pos.z - Math.cos(p.car.heading) * back;
    cam.position.set(hx, up, hz);
    cam.lookAt(p.car.pos.x, 1.4, p.car.pos.z);
    const targetFov = 62 + state.speedRatio * 9;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    return;
  }
  const back = 6.5;
  const cx = p.pos.x + Math.sin(p.camYaw) * back * Math.cos(p.camPitch);
  const cz = p.pos.z + Math.cos(p.camYaw) * back * Math.cos(p.camPitch);
  const cy = p.pos.y + 2.6 + Math.sin(p.camPitch) * back;
  cam.position.set(cx, Math.max(1.1, cy), cz);
  cam.lookAt(p.pos.x, p.pos.y + 1.7, p.pos.z);
  if (Math.abs(cam.fov - 62) > 0.1) { cam.fov += (62 - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
}
