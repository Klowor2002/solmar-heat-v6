// Solmar Heat — hand-in program for the make.fun gta6-01 entry.
//
// The game is the static folder game/ sitting beside this file. This
// program's whole job is the hand-in: copy game/ and screenshots/ into
// the output directory, then write the dossier with the kit's own
// buildDossier library, so the bytes on disk are exactly the bytes the
// scorer rebuilds and compares. Nothing here is creative on purpose —
// a hand-in should be boring, deterministic, and identical every run.
//
// Local dry run, the same way the grader invokes it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps come straight from the kit's gate table: the text budget
// shapes the dossier, and the rest refuse anything the scorer would
// refuse anyway — too many screenshots, an oversized screenshot, a game
// folder over its file or byte budget, an over-long path.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function walkCount(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? walkCount(join(dir, entry.name)) : 1;
  }
  return total;
}

// Refuse a broken hand-in loudly, here, rather than letting it score
// zero later: the entry page, the staging list, the vendored library and
// all four staged screenshots must exist before a single byte is copied.
// The shots.json check matters more than it looks — without the list the
// scorer cannot replay the staged scenes, and the entry reads as a game
// with no evidence it ever ran.
function guardComplete() {
  const missing = [];
  if (!existsSync(join(here, 'game', 'index.html'))) missing.push('game/index.html');
  if (!existsSync(join(here, 'game', 'vendor', 'three.min.js'))) missing.push('game/vendor/three.min.js');
  if (!existsSync(join(here, 'shots.json'))) missing.push('shots.json');
  for (const shot of ['1-cover.jpg', '2-street.jpg', '3-mission.jpg', '4-city.jpg']) {
    if (!existsSync(join(here, 'screenshots', shot))) missing.push(`screenshots/${shot}`);
  }
  if (missing.length) throw new Error(`incomplete entry, missing: ${missing.join(', ')}`);
}
guardComplete();

// Copy first, dossier second: the dossier describes the output folder,
// never the working tree, so the two cannot drift apart.
mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(
  `solmar-heat v6: ${walkCount(join(outDir, 'game'))} game files, ` +
  `${walkCount(join(outDir, 'screenshots'))} screenshots, dossier ${dossier.length} bytes`,
);
