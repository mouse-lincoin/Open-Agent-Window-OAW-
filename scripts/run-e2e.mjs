import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = process.env.API_PORT ?? '3001';
const GATEWAY_PORT = process.env.GATEWAY_PORT ?? '3002';

const children = [];

function spawnService(filter, extraEnv = {}) {
  const child = spawn('pnpm', ['--filter', filter, 'start'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  return child;
}

async function waitForHealth(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function killChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

async function main() {
  spawnService('@oaw/api', { API_PORT });
  spawnService('@oaw/gateway', { GATEWAY_PORT });

  await Promise.all([
    waitForHealth(`http://localhost:${API_PORT}/health`),
    waitForHealth(`http://localhost:${GATEWAY_PORT}`),
  ]);

  const e2e = spawn('node', ['scripts/e2e-smoke.mjs'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, API_PORT, GATEWAY_PORT },
  });

  const exitCode = await new Promise((resolve) => {
    e2e.on('close', (code) => resolve(code ?? 1));
  });

  killChildren();
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  killChildren();
  process.exit(1);
});
