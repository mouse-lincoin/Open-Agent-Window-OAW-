import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/gateway/package.json', import.meta.url));
const { WebSocket } = require('ws');

const API = 'http://localhost:3001/api/v1';
const WS_URL = 'ws://localhost:3002/ws';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const workspace = await fetch(`${API}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'e2e', rootPath: '/workspace' }),
  }).then((r) => r.json());

  const events = [];
  const ws = new WebSocket(WS_URL);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.on('message', (data) => {
    events.push(JSON.parse(data.toString()));
  });

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

  send('initialize', {
    clientName: 'e2e',
    clientVersion: '0.1.0',
    protocolVersion: '0.1',
  });
  await sleep(200);

  send('session/new', { workspaceId: workspace.id, agentId: 'mock-agent' });
  await sleep(800);

  const created = events.find((e) => e.type === 'session/created');
  if (!created) {
    console.error('events so far:', events);
    throw new Error('session/created missing');
  }
  const sessionId = created.payload.sessionId;

  send('session/prompt', { text: 'hello mock' }, sessionId);
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

  send('diff/decision', { diffId: diff.payload.diffId, decision: 'accept' }, sessionId);
  await sleep(300);

  const messages = await fetch(`${API}/sessions/${sessionId}/messages`).then((r) => r.json());
  if (!messages.messages?.length) throw new Error('messages not persisted');

  console.log('E2E smoke passed:', {
    sessionId,
    eventTypes: [...new Set(events.map((e) => e.type))],
    messageCount: messages.messages.length,
    diffPath: diff.payload.path,
  });

  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
