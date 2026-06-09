import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { decodeEnvelope, EnvelopeDecodeError } from '@oaw/acp-client';
import { createEnvelope } from '@oaw/acp-client';
import { OawDatabase, resolveDefaultDatabasePath } from '@oaw/db';
import { WebSocketServer } from 'ws';
import { SessionManager } from './session-manager.js';

const databasePath = resolveDefaultDatabasePath(import.meta.url);
mkdirSync(dirname(databasePath), { recursive: true });

const db = new OawDatabase(databasePath);
const port = Number(process.env.GATEWAY_PORT ?? 3002);
const wsPath = process.env.WS_PATH ?? '/ws';
const permissionTimeoutMs = Number(process.env.PERMISSION_TIMEOUT_MS ?? 60_000);

const sessionManager = new SessionManager(db, permissionTimeoutMs);

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'gateway' }));
});

const wss = new WebSocketServer({ server, path: wsPath });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    void (async () => {
      try {
        const raw = decodeEnvelope(data.toString());
        await sessionManager.handleClientMessage(ws, raw);
      } catch (err) {
        const message =
          err instanceof EnvelopeDecodeError ? err.message : 'Internal error';
        const code = err instanceof EnvelopeDecodeError ? 'INVALID_MESSAGE' : 'INTERNAL';
        ws.send(
          JSON.stringify(
            createEnvelope('error', { code, message }),
          ),
        );
      }
    })();
  });

  ws.on('error', () => {
    // ignore
  });
});

server.listen(port, () => {
  console.log(`Gateway listening on ws://localhost:${port}${wsPath}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
