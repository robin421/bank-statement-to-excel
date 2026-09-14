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
    // `detached: true` puts the worker in its own process group so the timeout can
    // kill the whole tree. Spawning through `npx` created a wrapper whose grandchild
    // survived SIGKILL: on C10 the driver recorded a timeout at 300s while the
    // worker completed at 305.9s and overwrote it, so the artifact contradicted the
    // run log. Launch node directly and kill the group.
    const child = spawn(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/blind-eval-one.mjs', '--', entry.id, entry.path, outPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    });

    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
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
      // A worker that outlived the group kill must not be able to overwrite the
      // timeout record, so the driver's verdict wins whenever it fired first.
      let termination = 'completed';
      if (timedOut) return;
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
