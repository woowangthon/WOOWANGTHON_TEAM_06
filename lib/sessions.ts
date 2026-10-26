import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { getLesson } from '@/lib/lessons';
import type { Lang, Lesson, Worker, WorkerStatus } from '@/lib/types';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class StaleLevelError extends Error {}

type Row = Record<string, unknown>;

function toWorker(r: Row): Worker {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    name: String(r.name),
    lang: r.lang as Lang,
    status: r.status as WorkerStatus,
    level: Number(r.level),
  };
}

export async function createSession(instructionKo: string): Promise<string> {
  const text = instructionKo.trim();
  if (text.length < 1 || text.length > 500) throw new ValidationError('instruction must be 1-500 chars');
  const id = randomUUID();
  await getDb().execute({
    sql: 'INSERT INTO sessions (id, instruction_ko, created_at) VALUES (?, ?, ?)',
    args: [id, text, Date.now()],
  });
  return id;
}

export async function getSession(id: string) {
  const db = getDb();
  const s = (await db.execute({ sql: 'SELECT id, instruction_ko FROM sessions WHERE id = ?', args: [id] })).rows[0];
  if (!s) return null;
  const ws = await db.execute({ sql: 'SELECT * FROM workers WHERE session_id = ? ORDER BY rowid', args: [id] });
  return { id: String(s.id), instructionKo: String(s.instruction_ko), workers: ws.rows.map(toWorker) };
}

export async function joinSession(sessionId: string, name: string, lang: Lang): Promise<string> {
  const n = name.trim();
  if (n.length < 1 || n.length > 30) throw new ValidationError('name must be 1-30 chars');
  const db = getDb();
  const s = await db.execute({ sql: 'SELECT id FROM sessions WHERE id = ?', args: [sessionId] });
  if (!s.rows[0]) throw new NotFoundError('session not found');
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO workers (id, session_id, name, lang, status, level) VALUES (?, ?, ?, ?, 'pending', 0)",
    args: [id, sessionId, n, lang],
  });
  return id;
}

export async function getWorker(workerId: string): Promise<Worker | null> {
  const r = await getDb().execute({ sql: 'SELECT * FROM workers WHERE id = ?', args: [workerId] });
  return r.rows[0] ? toWorker(r.rows[0]) : null;
}

export function grade(lesson: Lesson, answers: number[]): boolean {
  return answers.length === lesson.quiz.length && lesson.quiz.every((q, i) => answers[i] === q.answerIndex);
}

async function requireWorker(workerId: string): Promise<Worker> {
  const w = await getWorker(workerId);
  if (!w) throw new NotFoundError('worker not found');
  return w;
}

async function setStatus(workerId: string, status: WorkerStatus) {
  await getDb().execute({ sql: 'UPDATE workers SET status = ? WHERE id = ?', args: [status, workerId] });
}

export async function submitAnswers(workerId: string, level: number, answers: number[]): Promise<{ passed: boolean }> {
  const w = await requireWorker(workerId);
  if (level !== w.level) throw new StaleLevelError('level changed');
  const session = (await getSession(w.sessionId))!;
  const { lesson } = await getLesson(session.instructionKo, w.lang, w.level);
  const passed = grade(lesson, answers);
  await setStatus(workerId, passed ? 'passed' : 'failed');
  return { passed };
}

export async function requestRetry(workerId: string): Promise<void> {
  await requireWorker(workerId);
  await getDb().execute({
    sql: "UPDATE workers SET level = level + 1, status = 'pending' WHERE id = ?",
    args: [workerId],
  });
}

export async function approveWorker(workerId: string): Promise<void> {
  await requireWorker(workerId);
  await setStatus(workerId, 'approved');
}
