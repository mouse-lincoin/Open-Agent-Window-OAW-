import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DiffPayload } from '@oaw/shared-types';

export interface DiffInput {
  path: string;
  before: string;
  after: string;
  toolCallId?: string;
}

export function createDiffPayload(
  diffId: string,
  input: DiffInput,
): DiffPayload {
  return {
    diffId,
    path: input.path,
    before: input.before,
    after: input.after,
    toolCallId: input.toolCallId,
  };
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  const fullPath = resolve(workspaceRoot, relativePath);
  const root = resolve(workspaceRoot);
  if (!fullPath.startsWith(root)) {
    throw new Error('Path escapes workspace root');
  }
  try {
    return await readFile(fullPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw err;
  }
}

export async function applyDiff(
  workspaceRoot: string,
  diff: Pick<DiffPayload, 'path' | 'after'>,
): Promise<void> {
  const fullPath = resolve(workspaceRoot, diff.path);
  const root = resolve(workspaceRoot);
  if (!fullPath.startsWith(root)) {
    throw new Error('Path escapes workspace root');
  }
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, diff.after, 'utf8');
}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const fullPath = resolve(workspaceRoot, relativePath);
  const root = resolve(workspaceRoot);
  if (!fullPath.startsWith(root)) {
    throw new Error('Path escapes workspace root');
  }
  return fullPath;
}

export async function buildEditFileDiff(
  workspaceRoot: string,
  relativePath: string,
  afterContent: string,
  toolCallId?: string,
): Promise<{ diffId: string; payload: DiffPayload }> {
  const before = await readWorkspaceFile(workspaceRoot, relativePath);
  const diffId = crypto.randomUUID();
  return {
    diffId,
    payload: createDiffPayload(diffId, {
      path: relativePath,
      before,
      after: afterContent,
      toolCallId,
    }),
  };
}
