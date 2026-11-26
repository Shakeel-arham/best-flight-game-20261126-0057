// Canyon Courier — make.fun entry program.
// Copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json with buildDossier from the kit's
// vendor/makefun-game.ts. Node 22, standard library only, no network.
// Deterministic: the same bytes come out on every run.

import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

async function copyTree(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
}

async function main(): Promise<void> {
  const gameDir = join(REPO_ROOT, 'game');
  const shotsDir = join(REPO_ROOT, 'screenshots');
  const outGameDir = join(OUTPUT_DIR, 'game');
  const outShotsDir = join(OUTPUT_DIR, 'screenshots');

  await mkdir(OUTPUT_DIR, { recursive: true });
  await copyTree(gameDir, outGameDir);
  await copyTree(shotsDir, outShotsDir);

  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  await writeFile(join(OUTPUT_DIR, 'dossier.json'), dossier);
}

await main();
