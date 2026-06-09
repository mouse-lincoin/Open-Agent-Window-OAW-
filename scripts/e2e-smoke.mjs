import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(new URL('../apps/gateway/package.json', import.meta.url));
const { WebSocket } = require('ws');

const API_PORT = process.env.API_PORT ?? '3001';
const GATEWAY_PORT = process.env.GATEWAY_PORT ?? '3002';
const API = `http://localhost:${API_PORT}/api/v1`;
const WS_URL = `ws://localhost:${GATEWAY_PORT}/ws`;

// 使用临时工作区目录，避免 e2e 直接写入本仓库。
const workspaceRoot = mkdtempSync(join(tmpdir(), 'oaw-e2e-'));
writeFileSync(join(workspaceRoot, 'README.md'), '# e2e fixture\n');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function runMockTurn(ws, events, workspaceId, promptText) {
  const send = (type, payload, sessionId) => {
    ws.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        type,
        sessionId,
        ts: Date.now(),
        payload,
      }),
    );
  };

  send('session/new', { workspaceId, agentId: 'mock-agent' });
  await sleep(800);

  const created = events.find((e) => e.type === 'session/created');
  if (!created) throw new Error('session/created missing');
  const sessionId = created.payload.sessionId;

  send('session/prompt', { text: promptText }, sessionId);
  await sleep(500);

  const permission = events.find((e) => e.type === 'permission/request');
  if (!permission) throw new Error('permission/request missing');

  send(
    'permission/response',
    { requestId: permission.payload.requestId, decision: 'allow_once' },
    sessionId,
  );
  await sleep(500);

  const diff = events.find((e) => e.type === 'diff');
  if (!diff) throw new Error('diff missing');

  return { sessionId, diff, send };
}

async function main() {
  const workspace = await fetch(`${API}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'e2e', rootPath: workspaceRoot }),
  }).then((r) => r.json());

  const events = [];
  const ws = await createWs();
  ws.on('message', (data) => {
    events.push(JSON.parse(data.toString()));
  });

  ws.send(
    JSON.stringify({
      id: crypto.randomUUID(),
      type: 'initialize',
      ts: Date.now(),
      payload: { clientName: 'e2e', clientVersion: '0.1.0', protocolVersion: '0.1' },
    }),
  );
  await sleep(200);

  const { sessionId, diff, send } = await runMockTurn(ws, events, workspace.id, 'hello mock');

  const historyBeforeDecision = await fetch(`${API}/sessions/${sessionId}/messages`).then((r) =>
    r.json(),
  );
  const pendingDiff = historyBeforeDecision.diffs?.find((d) => d.decision === 'pending');
  if (!pendingDiff) throw new Error('pending diff not returned in session history');
  if (pendingDiff.id !== diff.payload.diffId) {
    throw new Error('history diff id does not match live diff event');
  }

  send('session/end', {}, sessionId);
  await sleep(300);
  ws.close();
  await sleep(200);

  const ws2 = await createWs();
  ws2.send(
    JSON.stringify({
      id: crypto.randomUUID(),
      type: 'diff/decision',
      sessionId,
      ts: Date.now(),
      payload: { diffId: diff.payload.diffId, decision: 'accept' },
    }),
  );
  await sleep(400);
  ws2.close();

  const decidedDiff = await fetch(`${API}/sessions/${sessionId}/messages`)
    .then((r) => r.json())
    .then((body) => body.diffs?.find((d) => d.id === diff.payload.diffId));
  if (!decidedDiff || decidedDiff.decision !== 'accept') {
    throw new Error('diff decision not persisted after accept without active session');
  }

  const sessionDetail = await fetch(`${API}/sessions/${sessionId}`).then((r) => r.json());
  if (!sessionDetail.title) throw new Error('session title not set from first prompt');

  const messages = await fetch(`${API}/sessions/${sessionId}/messages`).then((r) => r.json());
  if (!messages.messages?.length) throw new Error('messages not persisted');
  if (!messages.diffs?.length) throw new Error('diffs not persisted in history');

  const events2 = [];
  const ws3 = await createWs();
  ws3.on('message', (data) => {
    events2.push(JSON.parse(data.toString()));
  });
  ws3.send(
    JSON.stringify({
      id: crypto.randomUUID(),
      type: 'initialize',
      ts: Date.now(),
      payload: { clientName: 'e2e', clientVersion: '0.1.0', protocolVersion: '0.1' },
    }),
  );
  await sleep(200);

  const turn2 = await runMockTurn(ws3, events2, workspace.id, 'second turn');
  const messagesAfter = await fetch(`${API}/sessions/${turn2.sessionId}/messages`).then((r) =>
    r.json(),
  );
  if (!messagesAfter.messages?.length) {
    throw new Error('second session did not persist messages');
  }

  ws3.close();

  console.log('E2E smoke passed:', {
    sessionId,
    secondSessionId: turn2.sessionId,
    eventTypes: [...new Set(events.map((e) => e.type))],
    messageCount: messages.messages.length,
    diffPath: diff.payload.path,
    pendingDiffRecovered: true,
    acceptWithoutActiveSession: true,
  });
}

main()
  .then(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  })
  .catch((err) => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    console.error(err);
    process.exit(1);
  });
