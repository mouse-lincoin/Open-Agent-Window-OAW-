import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OawDatabase } from '@oaw/db';
import { createApp } from './app.js';

describe('api app', () => {
  let db: OawDatabase;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'oaw-api-'));
    db = new OawDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects workspace when rootPath does not exist', async () => {
    const app = await createApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      payload: { name: 'bad', rootPath: '/path/that/does/not/exist' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('directory');
  });

  it('creates workspace when rootPath is a directory', async () => {
    const root = mkdtempSync(join(tempDir, 'workspace-'));
    const app = await createApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      payload: { name: 'demo', rootPath: root },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('demo');
  });

  it('returns session messages with diffs array', async () => {
    const root = mkdtempSync(join(tempDir, 'workspace-'));
    const workspace = db.createWorkspace({ name: 'demo', rootPath: root });
    const session = db.createSession({ workspaceId: workspace.id, agentId: 'mock-agent' });
    db.createMessage({ sessionId: session.id, role: 'user', content: 'hi' });
    db.createDiff({
      id: 'diff-1',
      sessionId: session.id,
      path: 'README.md',
      beforeText: '',
      afterText: 'x',
    });

    const app = await createApp(db);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${session.id}/messages`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.diffs).toHaveLength(1);
  });
});
