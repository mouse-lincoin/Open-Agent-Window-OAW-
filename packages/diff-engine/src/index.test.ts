import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDiff, buildEditFileDiff, readWorkspaceFile } from './index.js';

describe('diff-engine', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('reads missing file as empty string', async () => {
    dir = await mkdtemp(join(tmpdir(), 'oaw-diff-'));
    const content = await readWorkspaceFile(dir, 'missing.txt');
    expect(content).toBe('');
  });

  it('applies diff to workspace file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'oaw-diff-'));
    const { payload } = await buildEditFileDiff(dir, 'hello.txt', 'hello world', 'tc-1');
    await applyDiff(dir, payload);
    const written = await readFile(join(dir, 'hello.txt'), 'utf8');
    expect(written).toBe('hello world');
    expect(payload.before).toBe('');
    expect(payload.toolCallId).toBe('tc-1');
  });
});
