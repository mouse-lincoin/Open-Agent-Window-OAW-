import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { listAgents } from '@oaw/agent-registry';
import { OawDatabase, resolveDefaultDatabasePath } from '@oaw/db';
import type { ApiError } from '@oaw/shared-types';
import { buildFileTree, readWorkspaceFileContent } from './files.js';

const databasePath = resolveDefaultDatabasePath(import.meta.url);
mkdirSync(dirname(databasePath), { recursive: true });

const db = new OawDatabase(databasePath);
const port = Number(process.env.API_PORT ?? 3001);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

function notFound(code: ApiError['error']['code'], message: string) {
  return { statusCode: 404, body: { error: { code, message } } };
}

app.get('/api/v1/workspaces', async () => ({ workspaces: db.listWorkspaces() }));

app.post<{ Body: { name: string; rootPath: string } }>('/api/v1/workspaces', async (req, reply) => {
  const { name, rootPath } = req.body;
  if (!name || !rootPath) {
    return reply.status(400).send({
      error: { code: 'INVALID_MESSAGE', message: 'name and rootPath are required' },
    });
  }
  const workspace = db.createWorkspace({ name, rootPath });
  return reply.status(201).send(workspace);
});

app.get<{ Params: { id: string } }>('/api/v1/workspaces/:id', async (req, reply) => {
  const workspace = db.getWorkspace(req.params.id);
  if (!workspace) {
    const err = notFound('WORKSPACE_NOT_FOUND', 'workspace not found');
    return reply.status(err.statusCode).send(err.body);
  }
  return workspace;
});

app.delete<{ Params: { id: string } }>('/api/v1/workspaces/:id', async (req, reply) => {
  const deleted = db.deleteWorkspace(req.params.id);
  if (!deleted) {
    const err = notFound('WORKSPACE_NOT_FOUND', 'workspace not found');
    return reply.status(err.statusCode).send(err.body);
  }
  return reply.status(204).send();
});

app.get<{ Params: { id: string } }>('/api/v1/workspaces/:id/files', async (req, reply) => {
  const workspace = db.getWorkspace(req.params.id);
  if (!workspace) {
    const err = notFound('WORKSPACE_NOT_FOUND', 'workspace not found');
    return reply.status(err.statusCode).send(err.body);
  }
  const tree = await buildFileTree(workspace.rootPath);
  return { tree };
});

app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
  '/api/v1/workspaces/:id/files/content',
  async (req, reply) => {
    const workspace = db.getWorkspace(req.params.id);
    if (!workspace) {
      const err = notFound('WORKSPACE_NOT_FOUND', 'workspace not found');
      return reply.status(err.statusCode).send(err.body);
    }
    const filePath = req.query.path;
    if (!filePath) {
      return reply.status(400).send({
        error: { code: 'INVALID_MESSAGE', message: 'path query is required' },
      });
    }
    try {
      const content = await readWorkspaceFileContent(workspace.rootPath, filePath);
      return { path: filePath, content };
    } catch {
      return reply.status(404).send({
        error: { code: 'WORKSPACE_NOT_FOUND', message: 'file not found' },
      });
    }
  },
);

app.get<{ Params: { id: string } }>('/api/v1/workspaces/:id/sessions', async (req, reply) => {
  const workspace = db.getWorkspace(req.params.id);
  if (!workspace) {
    const err = notFound('WORKSPACE_NOT_FOUND', 'workspace not found');
    return reply.status(err.statusCode).send(err.body);
  }
  return { sessions: db.listSessionsByWorkspace(req.params.id) };
});

app.get<{ Params: { id: string } }>('/api/v1/sessions/:id', async (req, reply) => {
  const session = db.getSession(req.params.id);
  if (!session) {
    const err = notFound('SESSION_NOT_FOUND', 'session not found');
    return reply.status(err.statusCode).send(err.body);
  }
  return session;
});

app.get<{ Params: { id: string } }>('/api/v1/sessions/:id/messages', async (req, reply) => {
  const session = db.getSession(req.params.id);
  if (!session) {
    const err = notFound('SESSION_NOT_FOUND', 'session not found');
    return reply.status(err.statusCode).send(err.body);
  }
  const messages = db.listMessages(req.params.id).map((message) => ({
    ...message,
    toolCalls: db.listToolCallsByMessage(message.id),
  }));
  return { messages };
});

app.delete<{ Params: { id: string } }>('/api/v1/sessions/:id', async (req, reply) => {
  const deleted = db.deleteSession(req.params.id);
  if (!deleted) {
    const err = notFound('SESSION_NOT_FOUND', 'session not found');
    return reply.status(err.statusCode).send(err.body);
  }
  return reply.status(204).send();
});

app.get('/api/v1/agents', async () => ({ agents: listAgents() }));

app.get('/health', async () => ({ ok: true }));

await app.listen({ port, host: '0.0.0.0' });
console.log(`API listening on http://localhost:${port}`);

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
