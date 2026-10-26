import { expect, test } from 'vitest';
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
