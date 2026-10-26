import { expect, test, vi } from 'vitest';
import { getDb, initDb } from '@/lib/db';
import { LessonSchema, type Lesson } from '@/lib/types';

const opt = (text: string) => ({ emoji: '🔧', text });

function validLessonFixture(over: { answerIndex?: number } = {}): Lesson {
  const lesson: Lesson = {
    steps: [{ emoji: '🦺', text: 'Wear a helmet' }],
    quiz: [
      { question: 'What do you wear?', options: [opt('a'), opt('b'), opt('c')], answerIndex: 0 },
      { question: 'Where?', options: [opt('a'), opt('b'), opt('c')], answerIndex: 1 },
    ],
    ui: { submit: 'Submit', passed: 'Passed', failed: 'Failed', waiting: 'Waiting' },
  };
  if (over.answerIndex !== undefined) lesson.quiz[0].answerIndex = over.answerIndex as 0 | 1 | 2;
  return lesson;
}

test('initDb creates tables', async () => {
  await initDb();
  const r = await getDb().execute("SELECT name FROM sqlite_master WHERE type='table'");
  expect(r.rows.map((x) => x.name)).toEqual(
    expect.arrayContaining(['sessions', 'workers', 'lessons', 'llm_calls']),
  );
});

test('LessonSchema accepts a valid lesson', () => {
  expect(LessonSchema.safeParse(validLessonFixture()).success).toBe(true);
});

test('LessonSchema rejects answerIndex 3', () => {
  expect(LessonSchema.safeParse(validLessonFixture({ answerIndex: 3 })).success).toBe(false);
});

test('blank DATABASE_URL falls back to the local file', async () => {
  const createClient = vi.fn(() => ({}));
  vi.resetModules();
  vi.doMock('@libsql/client', () => ({ createClient }));
  vi.stubEnv('DATABASE_URL', '');
  const { getDb: fresh } = await import('@/lib/db');
  fresh();
  expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:local.db' }));
  vi.doUnmock('@libsql/client');
  vi.unstubAllEnvs();
});

test('initDb adds admin_id to a pre-existing sessions table and is idempotent', async () => {
  const db = getDb();
  await db.execute('DROP TABLE IF EXISTS sessions');
  await db.execute('CREATE TABLE sessions (id TEXT PRIMARY KEY, instruction_ko TEXT, created_at INTEGER)');
  await initDb();
  await initDb();
  const cols = await db.execute('PRAGMA table_info(sessions)');
  expect(cols.rows.map((c) => c.name)).toContain('admin_id');
});
