import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { OawDatabase, resolveDefaultDatabasePath } from '@oaw/db';
import { createApp } from './app.js';

const databasePath = resolveDefaultDatabasePath(import.meta.url);
mkdirSync(dirname(databasePath), { recursive: true });

const db = new OawDatabase(databasePath);
const port = Number(process.env.API_PORT ?? 3001);

const app = await createApp(db);
await app.listen({ port, host: '0.0.0.0' });
console.log(`API listening on http://localhost:${port}`);

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
