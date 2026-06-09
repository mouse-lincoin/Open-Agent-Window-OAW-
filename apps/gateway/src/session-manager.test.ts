import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEnvelope } from '@oaw/acp-client';
import { OawDatabase } from '@oaw/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { SessionManager } from './session-manager.js';

class MockWebSocket {
  static OPEN = 1;
  readonly OPEN = 1;
  readyState = MockWebSocket.OPEN;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }
}

function asWs(mock: MockWebSocket): WebSocket {
  return mock as unknown as WebSocket;
}

describe('SessionManager', () => {
  let db: OawDatabase;
  let tempDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'oaw-gw-'));
    db = new OawDatabase(join(tempDir, 'test.db'));
    manager = new SessionManager(db, 60_000);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 700));
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not persist session when agentId is invalid', async () => {
    const root = mkdtempSync(join(tempDir, 'workspace-'));
    const workspace = db.createWorkspace({ name: 'demo', rootPath: root });
    const ws = new MockWebSocket();

    await manager.handleClientMessage(
      asWs(ws),
      createEnvelope('session/new', { workspaceId: workspace.id, agentId: 'unknown-agent' }),
    );

    const sessions = db.listSessionsByWorkspace(workspace.id);
    expect(sessions).toHaveLength(0);
    expect(ws.sent.some((frame) => frame.includes('error'))).toBe(true);
  });

  it('creates session and agent for mock-agent', async () => {
    const root = mkdtempSync(join(tempDir, 'workspace-'));
    const workspace = db.createWorkspace({ name: 'demo', rootPath: root });
    const ws = new MockWebSocket();

    await manager.handleClientMessage(
      asWs(ws),
      createEnvelope('session/new', { workspaceId: workspace.id, agentId: 'mock-agent' }),
    );

    const sessions = db.listSessionsByWorkspace(workspace.id);
    expect(sessions).toHaveLength(1);
    expect(ws.sent.some((frame) => frame.includes('session/created'))).toBe(true);
  });

  it('stops agent when connection closes', async () => {
    const root = mkdtempSync(join(tempDir, 'workspace-'));
    const workspace = db.createWorkspace({ name: 'demo', rootPath: root });
    const ws = new MockWebSocket();

    await manager.handleClientMessage(
      asWs(ws),
      createEnvelope('session/new', { workspaceId: workspace.id, agentId: 'mock-agent' }),
    );

    const created = ws.sent.find((frame) => frame.includes('session/created'));
    expect(created).toBeTruthy();
    const sessionId = JSON.parse(created!).payload.sessionId as string;

    await manager.handleConnectionClosed(asWs(ws));

    const ws2 = new MockWebSocket();
    await manager.handleClientMessage(
      asWs(ws2),
      createEnvelope('session/prompt', { text: 'hello' }, { sessionId }),
    );

    expect(ws2.sent.some((frame) => frame.includes('error'))).toBe(false);
    const messages = db.listMessages(sessionId);
    expect(messages.some((m) => m.role === 'user' && m.content === 'hello')).toBe(true);
  });

  it('does not create empty agent messages on attach', async () => {
    const root = mkdtempSync(join(tempDir, 'workspace-'));
    const workspace = db.createWorkspace({ name: 'demo', rootPath: root });
    const ws = new MockWebSocket();

    await manager.handleClientMessage(
      asWs(ws),
      createEnvelope('session/new', { workspaceId: workspace.id, agentId: 'mock-agent' }),
    );

    const created = ws.sent.find((frame) => frame.includes('session/created'));
    const sessionId = JSON.parse(created!).payload.sessionId as string;
    const messages = db.listMessages(sessionId);
    expect(messages.filter((m) => m.role === 'agent')).toHaveLength(0);
  });
});
