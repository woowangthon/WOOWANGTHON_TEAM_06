import { createClient, type Client } from '@libsql/client';

let client: Client | undefined;

export function getDb(): Client {
  client ??= createClient({
    url: process.env.DATABASE_URL || 'file:local.db',
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return client;
}

export async function initDb(): Promise<void> {
  await getDb().batch([
    'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, instruction_ko TEXT, created_at INTEGER, admin_id TEXT)',
    'CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, session_id TEXT, name TEXT, lang TEXT, status TEXT, level INTEGER)',
    'CREATE TABLE IF NOT EXISTS lessons (key TEXT PRIMARY KEY, json TEXT, mock INTEGER)',
    'CREATE TABLE IF NOT EXISTS llm_calls (hour TEXT PRIMARY KEY, count INTEGER)',
  ]);
  const cols = await getDb().execute('PRAGMA table_info(sessions)');
  if (!cols.rows.some((c) => c.name === 'admin_id')) await getDb().execute('ALTER TABLE sessions ADD COLUMN admin_id TEXT');
}
