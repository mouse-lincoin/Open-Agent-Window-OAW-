import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DiffPayload } from '@oaw/shared-types';
import { resolveWithinWorkspace } from './path-safe.js';

export { assertWithinWorkspaceRoot, resolveWithinWorkspace, toRelativeWorkspacePath } from './path-safe.js';

export interface DiffInput {
  path: string;
  before: string;
  after: string;
  toolCallId?: string;
}

export function createDiffPayload(diffId: string, input: DiffInput): DiffPayload {
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
  const fullPath = resolveWithinWorkspace(workspaceRoot, relativePath);
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
  const fullPath = resolveWithinWorkspace(workspaceRoot, diff.path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, diff.after, 'utf8');
}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  return resolveWithinWorkspace(workspaceRoot, relativePath);
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

export function buildUnifiedDiff(before: string, after: string, filePath: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
  ];
  const body = afterLines.map((line) => `+${line}`);
  return [...header, ...body].join('\n');
}
