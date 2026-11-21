// city.js — Solmar City itself: the ground, the buildings, the landmarks.
//
// Layout, in world units. Roads run on a 40-unit pitch: road centrelines
// sit at every multiple of 40 from -200 to +200, each road 12 wide. The
// blocks between them are 28 across, centred at -180, -140, ..., +180 on
// both axes — a 10 by 10 grid of blocks. South (+z) the grid gives way to
// a sand beach and then the sea; north (-z) green hills close the view.
//
// Everything visual is procedural: the ground is one big canvas texture
// (asphalt, lane dashes, crosswalks, block pads), the windows are a small
// canvas texture repeated per building, and the landmark signs are canvas
// textures with painted lettering. No image files, no network.
import * as THREE from 'three';
import { rng, randRange, randPick } from './utils.js';

export const BLOCK_PITCH = 40;
export const ROAD_HALF = 6;              // half the road width
export const CITY_EDGE = 200;            // last road centreline
export const colliders = [];             // {x, z, r} circles, buildings only

const buildingPalette = [0x8f7f9e, 0xa08bb0, 0x7d6f92, 0xb59a8a, 0x6f7f9e, 0x9e8b7d, 0x87789f, 0x5f6f8f];

// One shared window texture. Windows glow amber because the shipped look
// is dusk; the emissive map is the same canvas so lit windows read at
// screenshot size.
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#241d33'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = rng() > 0.42;
    g.fillStyle = lit ? '#ffca7a' : '#171126';
    g.fillRect(6 + x * 15, 6 + y * 15, 9, 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Painted lettering for the landmark signs.
function signTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg;
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  return new THREE.CanvasTexture(c);
}

function groundTexture() {
  const S = 2048, half = 440; // texture spans -440..440 world units
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const px = (w) => (w + half) / (half * 2) * S;
  const sc = S / (half * 2);
  // Base: block pads (dark violet-grey), then roads on top.
  g.fillStyle = '#2c2440'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#241c36';
  for (let i = -180; i <= 180; i += 40) for (let j = -180; j <= 180; j += 40) {
    g.fillRect(px(i - 14), px(j - 14), 28 * sc, 28 * sc);
  }
  // Asphalt.
  g.fillStyle = '#17141f';
  for (let i = -200; i <= 200; i += 40) {
    g.fillRect(px(i - ROAD_HALF), 0, ROAD_HALF * 2 * sc, S);
    g.fillRect(0, px(i - ROAD_HALF), S, ROAD_HALF * 2 * sc);
  }
  // Lane dashes down the centre of every road.
  g.fillStyle = '#c8b060';
  for (let i = -200; i <= 200; i += 40) {
    for (let d = -210; d < 210; d += 16) {
      g.fillRect(px(i) - 1, px(d), 2, 8 * sc);
      g.fillRect(px(d), px(i) - 1, 8 * sc, 2);
    }
  }
  // Crosswalks at intersections.
  g.fillStyle = 'rgba(230,230,230,0.5)';
  for (let i = -200; i <= 200; i += 40) for (let j = -200; j <= 200; j += 40) {
    for (let s = -4; s <= 4; s += 2) {
      g.fillRect(px(i + s) - 1, px(j - ROAD_HALF), 2, 3);
      g.fillRect(px(i + s) - 1, px(j + ROAD_HALF) - 3, 2, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function addBuilding(parent, winTex, x, z, w, d, h, color) {
  const tex = winTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 7)));
  const mat = new THREE.MeshLambertMaterial({ color, map: tex, emissive: 0xffb45e, emissiveMap: tex, emissiveIntensity: 0.55 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, h / 2, z);
  parent.add(mesh);
  colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
  return mesh;
}

function addSign(parent, text, x, y, z, bg, fg, w = 16) {
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  const back = mesh.clone();
  back.rotation.y = Math.PI;
  back.position.z = z + 0.1;
  parent.add(back);
  return mesh;
}

export function buildCity(scene) {
  const city = new THREE.Group();
  scene.add(city);
  const winTex = windowTexture();

  // Ground plane carrying the painted street plan.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(880, 880),
    new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2;
  city.add(ground);

  // The buildings. Centre blocks grow tall; the rim stays low, so the
  // skyline reads as a downtown with suburbs around it.
  for (let bx = -180; bx <= 180; bx += 40) {
    for (let bz = -180; bz <= 180; bz += 40) {
      if (bx === 60 && bz === -60) continue;   // Solmar Tower's block
      if (bx === 0 && bz === 0) continue;      // the Bank's block
      const distC = Math.sqrt(bx * bx + bz * bz);
      const tall = distC < 110;
      const count = rng() > 0.45 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const w = randRange(11, 17), d = randRange(11, 17);
        const ox = count === 1 ? randRange(-3, 3) : (k === 0 ? -7 : 7) + randRange(-1.5, 1.5);
        const oz = count === 1 ? randRange(-3, 3) : randRange(-4, 4);
        const h = tall ? randRange(20, 50) : randRange(8, 21);
        addBuilding(city, winTex, bx + ox, bz + oz, w, d, h, randPick(buildingPalette));
      }
    }
  }

  // Solmar Tower: the landmark. 78 units of tower plus a red spire that
  // catches the light from anywhere in the city.
  addBuilding(city, winTex, 60, -60, 20, 20, 78, 0x4a3f66);
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a3c }));
  spire.position.set(60, 84, -60);
  city.add(spire);
  addSign(city, 'SOLMAR TOWER', 60, 30, -49.8, '#1a1426', '#ffd24a', 18);

  // Solmar Bank at the very centre: a pale block with a columned front.
  addBuilding(city, winTex, 0, 0, 24, 18, 16, 0xcfc4ae);
  const columnMat = new THREE.MeshLambertMaterial({ color: 0xe8e0cc });
  for (let i = -2; i <= 2; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 13, 8), columnMat);
    col.position.set(i * 4.4, 6.5, 10.5);
    city.add(col);
  }
  addSign(city, 'SOLMAR BANK', 0, 14, 9.4, '#e8e0cc', '#4a3a20', 18);

  // Mona's Garage (the safehouse) in the north-west, the Chop Shop in the
  // south-west, the hospital, and the Lagoon Hotel near the beach.
  addBuilding(city, winTex, -120, -120, 20, 14, 9, 0x7d5a3a);
  addSign(city, "MONA'S GARAGE", -120, 7, -112.8, '#3a2415', '#ffb45e', 16);
  addBuilding(city, winTex, -160, 160, 20, 16, 10, 0x5a4a5e);
  addSign(city, 'REYES CHOP SHOP', -160, 8, 151.8, '#241426', '#ff5e7a', 18);
  addBuilding(city, winTex, -60, 60, 18, 14, 12, 0xd8d8e0);
  addSign(city, 'HOSPITAL', -60, 10, 67.2, '#e8e8f0', '#d42a3c', 14);
  addBuilding(city, winTex, 120, 180, 22, 16, 26, 0x9e7d5a);
  addSign(city, 'LAGOON HOTEL', 120, 20, 171.8, '#14303a', '#7ae0ff', 18);

  // Beach and sea to the south.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(880, 44),
    new THREE.MeshLambertMaterial({ color: 0xd9b878 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.06, 226);
  city.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(880, 190),
    new THREE.MeshLambertMaterial({ color: 0x14425e }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.04, 343);
  city.add(sea);
  // The pier: a wooden walk reaching out over the water at x = 120.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 64),
    new THREE.MeshLambertMaterial({ color: 0x6e5136 }));
  pier.position.set(120, 0.6, 268);
  city.add(pier);

  // Hills to the north, low and green, just silhouettes at dusk.
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x2a4430 });
  for (let i = 0; i < 7; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(randRange(38, 70), 12, 8), hillMat);
    hill.scale.y = 0.32;
    hill.position.set(-260 + i * 85 + randRange(-14, 14), 0, -268 + randRange(-16, 16));
    city.add(hill);
  }

  // Palms and street lamps along the roads — small details, but they are
  // what make the grid feel like a coastal city at screenshot size.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6e5136 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7d46 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333340 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let i = -200; i <= 200; i += 40) {
    for (let j = -200; j <= 200; j += 80) {
      if (rng() > 0.35) {
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 7, 6), trunkMat);
        trunk.position.y = 3.5;
        palm.add(trunk);
        for (let f = 0; f < 5; f++) {
          const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4.6, 4), frondMat);
          frond.position.y = 7.2;
          frond.rotation.z = 1.15;
          frond.rotation.y = (f / 5) * Math.PI * 2;
          frond.translateX(1.6);
          palm.add(frond);
        }
        palm.position.set(i + 8.5, 0, j + 8.5);
        city.add(palm);
      }
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 6), lampMat);
      pole.position.y = 3;
      lamp.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bulbMat);
      bulb.position.y = 6.1;
      lamp.add(bulb);
      lamp.position.set(i - 8.5, 0, j + 20);
      city.add(lamp);
    }
  }

  // Clouds: soft white slabs drifting far above the skyline.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf2e8f5, transparent: true, opacity: 0.75 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Mesh(new THREE.BoxGeometry(randRange(28, 55), 2.4, randRange(14, 24)), cloudMat);
    cl.position.set(randRange(-300, 300), randRange(85, 115), randRange(-300, 300));
    clouds.add(cl);
  }
  city.add(clouds);
  city.userData.clouds = clouds;
  return city;
}

// Circle collision: keeps the player, cars and peds out of the buildings.
// Pushes the point out along the shortest escape and reports the hit.
export function collideCircle(pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const rr = c.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = c.x + (dx / d) * rr;
      pos.z = c.z + (dz / d) * rr;
      hit = true;
    }
  }
  // The world ends at the sea and past the hills.
  pos.x = Math.max(-214, Math.min(214, pos.x));
  pos.z = Math.max(-214, Math.min(292, pos.z));
  return hit;
}
