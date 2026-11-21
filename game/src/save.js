// save.js — progress persistence in localStorage.
//
// What survives a reload: cash, how far the story has advanced, which
// tokens were found, whether the story is finished, and where Jax was
// standing. Everything else (wanted level, health, traffic) is session
// flavour and starts fresh — being busted should not follow you home.
const SAVE_KEY = 'solmar-heat-save-v6';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: Number(data.money) || 0,
      missionsDone: Number(data.missionsDone) || 0,
      tokens: Array.isArray(data.tokens) ? data.tokens.map(Boolean).slice(0, 10) : [],
      storyDone: Boolean(data.storyDone),
      pos: data.pos && isFinite(data.pos.x) && isFinite(data.pos.z)
        ? { x: data.pos.x, z: data.pos.z } : null,
    };
  } catch (err) {
    // A corrupted or blocked store must never stop the game booting.
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      missionsDone: state.missionsDone,
      tokens: state.tokensFound,
      storyDone: state.storyDone,
      pos: { x: state.player.pos.x, z: state.player.pos.z },
    }));
  } catch (err) {
    // Private mode and friends: play on unsaved rather than crash.
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (err) { /* same reasoning */ }
}
