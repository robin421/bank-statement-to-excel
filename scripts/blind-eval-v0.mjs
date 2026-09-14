#!/usr/bin/env node
/**
 * Blind evaluation v0 — batch driver.
 *
 * FREEZE FIRST, RUN ONCE, RECORD EVERYTHING, CHANGE NOTHING.
 *
 * Runs the frozen parser over every entry in the manifest in a single batch, each
 * in its own child process so a hang is recorded as a timeout instead of being
 * worked around. No parser file is imported here for anything but execution, and
 * nothing writes back into the parser.
 *
 *   npm run blind-eval:v0
 *
 * Output: artifacts/blind-eval-v0/<id>.json  and  summary.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MANIFEST = 'corpus/blind-eval-v0-manifest.json';
const OUT_DIR = 'artifacts/blind-eval-v0';
const PER_FILE_TIMEOUT_MS = 300_000;

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

if (fs.existsSync(OUT_DIR) && fs.readdirSync(OUT_DIR).length) {
  console.error(
    `\n  ${OUT_DIR} already contains results.\n` +
      '  A blind run happens once. Move or delete that directory deliberately if you\n' +
      '  really intend to re-run — but a re-run after seeing the results is no longer\n' +
      '  out-of-sample evidence, whatever the new numbers say.\n',
  );
  process.exit(2);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`\n  frozen parser: commit ${manifest.parserSnapshot.commit}, beam ${manifest.parserSnapshot.beamWidth}`);
console.log(`  running ${manifest.entries.length} statements in one batch\n`);

function runOne(entry) {
  return new Promise((resolve) => {
    const outPath = path.join(OUT_DIR, `${entry.id}.json`);
    const child = spawn('npx', ['vite-node', 'scripts/blind-eval-one.mjs', '--', entry.id, entry.path, outPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fs.writeFileSync(
        outPath,
        `${JSON.stringify(
          {
            id: entry.id,
            pdfPath: entry.path,
            termination: 'timeout',
            durationMs: PER_FILE_TIMEOUT_MS,
            diagnosticsNote: 'killed by the batch driver at the per-file limit',
            result: null,
            error: { name: 'Timeout', code: 'PER_FILE_TIMEOUT', message: `exceeded ${PER_FILE_TIMEOUT_MS}ms` },
          },
          null,
          2,
        )}\n`,
      );
      resolve({ id: entry.id, termination: 'timeout' });
    }, PER_FILE_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      let termination = 'completed';
      if (code !== 0 && !fs.existsSync(outPath)) {
        fs.writeFileSync(
          outPath,
          `${JSON.stringify(
            {
              id: entry.id,
              pdfPath: entry.path,
              termination: 'crashed',
              durationMs: null,
              result: null,
              error: { name: 'ChildExit', code, message: stderr.slice(-800) },
            },
            null,
            2,
          )}\n`,
        );
        termination = 'crashed';
      }
      resolve({ id: entry.id, termination });
    });
  });
}

const outcomes = [];
for (const entry of manifest.entries) {
  const started = Date.now();
  const outcome = await runOne(entry);
  outcomes.push(outcome);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ${entry.id.padEnd(5)} ${outcome.termination.padEnd(10)} ${elapsed}s`);
}

const summary = {
  version: manifest.version,
  parserSnapshot: manifest.parserSnapshot,
  ranAt: new Date().toISOString(),
  outcomes,
};
fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`\n  all ${outcomes.length} statements executed. Results in ${OUT_DIR}/\n`);
console.log('  Nothing was modified. Analysis comes after, by reading these files.\n');
