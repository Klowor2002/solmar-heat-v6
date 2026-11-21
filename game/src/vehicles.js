// vehicles.js — every car in Solmar City: how they look, how traffic
// flows, and how the player's car drives.
//
// Cars are boxes with manners: a body, a cabin, four wheels that spin,
// headlights and taillights as small emissive panels. Three flavours —
// ordinary traffic sedans, the red Comet GT sports car the story revolves
// around, and the black-and-white police interceptor with its light bar.
//
// Traffic follows the road grid honestly: a car picks a direction at each
// intersection, holds its lane offset, and brakes when the car ahead gets
// close. Because roads are the only places cars ever drive, traffic can
// never end up inside a building.
import * as THREE from 'three';
import { rng, randRange, randPick, clamp, angleLerp, angleWrap } from './utils.js';
import { collideCircle } from './city.js';

const carColors = [0xc23b4e, 0x3b6ec2, 0x3ec27a, 0xe0a83b, 0xd8d8e0, 0x7a4ec2, 0x3bc2c2, 0xe06a3b, 0x5a6270];

export function buildCarMesh(kind, color) {
  const group = new THREE.Group();
  const isCop = kind === 'cop';
  const isSport = kind === 'sport';
  const bodyColor = isCop ? 0xf0f0f4 : color;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.62, isSport ? 4.5 : 4.2),
    new THREE.MeshLambertMaterial({ color: bodyColor }));
  body.position.y = 0.55;
  group.add(body);
  if (isCop) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.3, 4.24),
      new THREE.MeshLambertMaterial({ color: 0x181822 }));
    stripe.position.y = 0.42;
    group.add(stripe);
  }
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.55, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x1c2436 }));
  cabin.position.set(0, 1.1, -0.2);
  group.add(cabin);
  if (isSport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x22222c }));
    spoiler.position.set(0, 1.05, -2.05);
    group.add(spoiler);
  }
  if (isCop) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2438 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2456ff }));
    blue.position.x = 0.3;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.48, -0.2);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  // Headlights (front, +z is forward in car space) and taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3040 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lightMat);
    hl.position.set(sx, 0.62, (isSport ? 4.5 : 4.2) / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.66, -(isSport ? 4.5 : 4.2) / 2 - 0.02);
    group.add(tl);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14141a });
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.35], [1.0, 1.35], [-1.0, -1.35], [1.0, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w);
    wheels.push(w);
  }
  group.userData.wheels = wheels;
  return group;
}

// One car record: physics state plus the mesh. `driver` is 'traffic',
// 'player', 'cop' or 'parked'.
export function makeCar(kind, color, x, z, heading) {
  const mesh = buildCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    kind, mesh,
    pos: mesh.position,
    heading, speed: 0,
    topSpeed: kind === 'sport' ? 46 : kind === 'cop' ? 41 : 36,
    driver: 'parked',
    health: 100,
    laneOffset: 3,           // traffic keeps right
    targetSpeed: 0,
    fenceValue: kind === 'sport' ? 420 : 120 + Math.floor(rng() * 160),
    wheelSpin: 0,
  };
}

// The fixed parked-car spots: on road edges, clear of intersections, so a
// parked car never blocks a lane's through path for long.
const PARKED_SPOTS = [
  [-40, 26, 0], [40, -34, Math.PI], [80, 66, 0], [-80, -106, Math.PI],
  [120, 26, 0], [-120, -74, Math.PI], [160, 106, 0], [-160, 146, Math.PI],
  [0, -146, 0], [200 - 6, -40 + 26, 0], [-200 + 6, 80 - 34, Math.PI], [40, 186, 0],
];

export function spawnTraffic(scene, state) {
  // Circulating traffic: start each car on a road, aimed along it.
  for (let i = 0; i < 24; i++) {
    const horizontal = rng() > 0.5;
    const line = -200 + Math.floor(rng() * 11) * 40;
    const along = randRange(-195, 195);
    const dir = rng() > 0.5 ? 1 : -1;
    const x = horizontal ? along : line + 3 * dir;
    const z = horizontal ? line - 3 * dir : along;
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = makeCar('sedan', randPick(carColors), x, z, heading);
    car.driver = 'traffic';
    car.targetSpeed = randRange(11, 17);
    car.speed = car.targetSpeed;
    scene.add(car.mesh);
    state.traffic.push(car);
    state.allCars.push(car);
  }
  // Parked cars, including the red Comet GT the second mission steals.
  for (const [x, z, h] of PARKED_SPOTS) {
    const car = makeCar('sedan', randPick(carColors), x, z, h);
    scene.add(car.mesh);
    state.allCars.push(car);
  }
  const comet = makeCar('sport', 0xd8232f, 80, 120, 0);
  comet.isComet = true;
  scene.add(comet.mesh);
  state.allCars.push(comet);
  state.comet = comet;
  // The player's starter car, parked by Mona's Garage. It is honestly
  // his, so the Chop Shop will not fence it.
  const starter = makeCar('sedan', 0x3b6ec2, -112, -106, Math.PI / 2);
  starter.isStarter = true;
  scene.add(starter.mesh);
  state.allCars.push(starter);
  state.starterCar = starter;
}

// Traffic step: follow the current road to the next intersection, maybe
// turn, brake for the car ahead. Runs for every traffic-driven car.
export function updateTrafficCar(car, dt, state) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  // Brake if something (car or the player on foot) is close ahead.
  let desired = car.targetSpeed;
  for (const other of state.allCars) {
    if (other === car) continue;
    const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 9 && side < 2.4) { desired = Math.min(desired, Math.max(0, (ahead - 5) * 1.6)); break; }
  }
  const p = state.player;
  if (!p.inCar) {
    const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
    const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 8 && side < 2.2) desired = 0;
  }
  car.speed += clamp(desired - car.speed, -22 * dt, 7 * dt);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  // At an intersection, choose: mostly straight, sometimes a turn.
  const gx = Math.round(car.pos.x / 40) * 40, gz = Math.round(car.pos.z / 40) * 40;
  const nearX = Math.abs(car.pos.x - gx) < 1.6, nearZ = Math.abs(car.pos.z - gz) < 1.6;
  if (nearX && nearZ && car.speed > 2) {
    const roll = rng();
    if (roll < 0.3) car.heading += Math.PI / 2;
    else if (roll < 0.42) car.heading -= Math.PI / 2;
    // Nudge onto the new lane's right-hand offset.
    car.pos.x = gx + Math.sin(car.heading) * 0 + Math.cos(car.heading) * 0;
    car.pos.x = gx + (Math.abs(Math.sin(car.heading)) > 0.5 ? 0 : 3 * Math.sign(Math.cos(car.heading)) * 1);
    car.pos.z = gz + (Math.abs(Math.cos(car.heading)) > 0.5 ? 0 : -3 * Math.sign(Math.sin(car.heading)) * 1);
    if (Math.abs(Math.sin(car.heading)) > 0.5) car.pos.z = gz - 3 * Math.sign(Math.sin(car.heading));
    if (Math.abs(Math.cos(car.heading)) > 0.5) car.pos.x = gx + 3 * Math.sign(Math.cos(car.heading));
  }
  // Keep traffic inside the city: turn around at the rim roads.
  if (Math.abs(car.pos.x) > 202 || Math.abs(car.pos.z) > 202) {
    car.heading += Math.PI;
    car.pos.x = clamp(car.pos.x, -200, 200);
    car.pos.z = clamp(car.pos.z, -200, 200);
  }
  finishCarFrame(car, dt);
}

// A module-level tick counter drives the police light bar, so the blink
// phase is a function of simulation steps — never of wall-clock time —
// and staged screenshots freeze with the bar in a repeatable state.
let frameTick = 0;
export function finishCarFrame(car, dt) {
  frameTick++;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += car.speed * dt * 2.4;
  for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
  const bar = car.mesh.userData.lightBar;
  if (bar) bar.visible = car.driver !== 'cop' || Math.floor(frameTick / 18) % 2 === 0;
}

// Player driving: arcade physics. Throttle builds speed toward the car's
// top speed, steering authority scales with speed, the handbrake loosens
// the rear for drifts, and building collision scrubs speed with a crunch.
export function drivePlayerCar(car, input, dt, state) {
  const up = input.isDown('KeyW') || input.isDown('ArrowUp');
  const down = input.isDown('KeyS') || input.isDown('ArrowDown');
  const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
  const right = input.isDown('KeyD') || input.isDown('ArrowRight');
  const brake = input.isDown('Space');
  const accel = car.kind === 'sport' ? 21 : 17;
  if (up) car.speed += accel * dt;
  else if (down) car.speed -= (car.speed > 0.5 ? 24 : 9) * dt;
  else car.speed -= car.speed * 0.55 * dt;             // engine drag
  if (brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  car.speed = clamp(car.speed, -13, car.topSpeed);
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const authority = clamp(Math.abs(car.speed) / 9, 0, 1) * (brake ? 1.5 : 1);
  car.heading += steer * authority * 1.55 * dt * (car.speed < 0 ? -1 : 1);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  const before = Math.abs(car.speed);
  if (collideCircle(car.pos, 2.1)) {
    if (before > 12) { state.effects.debris(car.pos.x, 1, car.pos.z, 10); state.effects.addShake(0.4); state.audioHit = true; }
    car.speed *= 0.35;
    car.health -= before * 0.5;
  }
  // Car-to-car bumps: a soft push and a speed exchange, nothing fancier.
  for (const other of state.allCars) {
    if (other === car) continue;
    const dx = car.pos.x - other.pos.x, dz = car.pos.z - other.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 16 && d2 > 0.01) {
      const d = Math.sqrt(d2), push = (4 - d) / 2;
      other.pos.x -= dx / d * push * 0.4;
      other.pos.z -= dz / d * push * 0.4;
      car.pos.x += dx / d * push * 0.6;
      car.pos.z += dz / d * push * 0.6;
      if (Math.abs(car.speed) > 10) {
        state.effects.sparks(car.pos.x, 0.8, car.pos.z, 8);
        other.speed = car.speed * 0.4;
        car.speed *= 0.7;
      }
    }
  }
  finishCarFrame(car, dt);
  return Math.abs(car.speed) / car.topSpeed;
}
