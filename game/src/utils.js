// utils.js — the small shared toolbox every other module leans on.
//
// Solmar Heat has to render the exact same frame every time a staged
// screenshot runs, so nothing in the game may call Math.random. Instead
// the whole world draws from one seeded generator created here, and the
// shot stager re-seeds it before it pre-simulates a scene.

// mulberry32: a tiny, fast, seedable PRNG. Same seed, same stream, on
// every machine and every run — that property is the backbone of the
// deterministic screenshots.
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The one generator the world builders share. main.js seeds it from the
// URL (or the default) before anything is constructed.
export let rng = makeRng(1);
export function seedWorld(seed) {
  rng = makeRng(seed >>> 0);
}
// Convenience wrappers so call sites read naturally.
export function rand() { return rng(); }
export function randRange(lo, hi) { return lo + rng() * (hi - lo); }
export function randPick(list) { return list[Math.floor(rng() * list.length) % list.length]; }

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest-path angle interpolation: turning a car through the wrap at
// pi / -pi must take the short way around or steering feels broken.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleWrap(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// The squared form, for the hot loops that only compare a distance
// against a threshold and never need the actual length — traffic
// braking and pickup collection both ask "closer than X?" hundreds of
// times a frame, and the square root is the expensive way to answer.
export function dist2dSq(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

// Input: one keyboard/mouse state object for the whole game. Modules ask
// "is KeyW down" or consume one-shot presses ("was KeyM just hit") instead
// of each wiring their own listeners and fighting over events.
export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();   // keys that went down since the last frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;       // left button went down this frame
    this.locked = false;
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) this.clicked = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    this.canvas = canvas;
  }
  requestLock() {
    if (!this.locked && this.canvas) this.canvas.requestPointerLock();
  }
  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  // Called once at the end of every frame: one-shot signals reset here so
  // a press is seen by exactly one simulation step.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
  }
}
