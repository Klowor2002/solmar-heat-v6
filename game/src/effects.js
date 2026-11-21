// effects.js — the particle pool: sparks, debris, pickup sparkles.
//
// One fixed pool of point sprites, recycled round-robin. Bursts are
// short-lived and purely cosmetic, so the pool never allocates during
// play and a burst that arrives when the pool is busy simply overwrites
// the oldest motes. Deterministic: lifetimes tick with the fixed-step
// simulation, never with wall-clock time.
import * as THREE from 'three';

const POOL_SIZE = 420;

export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(POOL_SIZE * 3);
    this.colors = new Float32Array(POOL_SIZE * 3);
    this.vel = new Float32Array(POOL_SIZE * 3);
    this.life = new Float32Array(POOL_SIZE);      // seconds remaining
    this.maxLife = new Float32Array(POOL_SIZE);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95 });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    // Park every mote far below the city until it is first used.
    for (let i = 0; i < POOL_SIZE; i++) this.positions[i * 3 + 1] = -60;
    scene.add(this.points);
    // Camera shake: a decaying offset the camera code adds each frame.
    this.shake = 0;
  }

  burst(x, y, z, count, colorHex, speed = 6, up = 4, life = 0.55) {
    const col = new THREE.Color(colorHex);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % POOL_SIZE;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.colors[i * 3] = col.r; this.colors[i * 3 + 1] = col.g; this.colors[i * 3 + 2] = col.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
    }
  }

  // How many motes are alive right now — a cheap health check the
  // debug readout can quote to prove bursts actually fired.
  aliveCount() {
    let n = 0;
    for (let i = 0; i < POOL_SIZE; i++) if (this.life[i] > 0) n++;
    return n;
  }

  sparks(x, y, z, n = 10) { this.burst(x, y, z, n, 0xffc46b, 7, 3, 0.4); }
  debris(x, y, z, n = 12) { this.burst(x, y, z, n, 0x8a7f96, 5, 5, 0.7); }
  sparkle(x, y, z, n = 8) { this.burst(x, y, z, n, 0xffe97a, 2.5, 3, 0.6); }
  blood(x, y, z, n = 8) { this.burst(x, y, z, n, 0xc22e42, 4, 3, 0.5); }
  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  update(dt) {
    for (let i = 0; i < POOL_SIZE; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.positions[i * 3 + 1] = -60; continue; }
      this.vel[i * 3 + 1] -= 12 * dt; // gravity pulls motes back down
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0.1) this.positions[i * 3 + 1] = 0.1;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  // A small random-looking but frame-stable jitter for the camera.
  shakeOffset(t) {
    if (this.shake <= 0) return { x: 0, y: 0 };
    const s = this.shake * 0.35;
    return { x: Math.sin(t * 61.7) * s, y: Math.cos(t * 53.3) * s * 0.7 };
  }
}
