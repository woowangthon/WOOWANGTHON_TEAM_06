import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db';
import { generateLesson, isMock } from '@/lib/llm';
import { LessonSchema, type Lang, type Lesson } from '@/lib/types';

export class RateLimitError extends Error {}

export function hourlyCap(): number {
  const n = Number(process.env.LLM_HOURLY_CAP || 100);
  return Number.isNaN(n) ? 100 : n;
}

export async function getLesson(
  instructionKo: string,
  lang: Lang,
  level: number,
): Promise<{ lesson: Lesson; mock: boolean }> {
  const db = getDb();
  const mock = isMock();
  const model = mock ? 'mock' : process.env.LLM_MODEL || 'claude-haiku-5-5';
  const key = createHash('sha256').update(`${instructionKo}|${lang}|${level}|${model}`).digest('hex');
  const hit = await db.execute({ sql: 'SELECT json, mock FROM lessons WHERE key = ?', args: [key] });
  if (hit.rows[0]) {
    return { lesson: LessonSchema.parse(JSON.parse(String(hit.rows[0].json))), mock: hit.rows[0].mock === 1 };
  }

  const hour = new Date().toISOString().slice(0, 13);
  const used = await db.execute({ sql: 'SELECT count FROM llm_calls WHERE hour = ?', args: [hour] });
  if (Number(used.rows[0]?.count ?? 0) >= hourlyCap()) {
    throw new RateLimitError('hourly LLM call cap reached');
  }
  await db.execute({
    sql: 'INSERT INTO llm_calls (hour, count) VALUES (?, 1) ON CONFLICT(hour) DO UPDATE SET count = count + 1',
    args: [hour],
  });

  const lesson = await generateLesson(instructionKo, lang, level);
  await db.execute({
    sql: 'INSERT OR REPLACE INTO lessons (key, json, mock) VALUES (?, ?, ?)',
    args: [key, JSON.stringify(lesson), mock ? 1 : 0],
  });
  return { lesson, mock };
}
