import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getDb, initDb } from '@/lib/db';
import { mockLesson } from '@/lib/fixtures/mock-lesson';
import { toResponse } from '@/lib/http';
import { LlmError } from '@/lib/llm';
import { RateLimitError } from '@/lib/lessons';
import { ForbiddenError, NotFoundError, StaleLevelError, ValidationError } from '@/lib/sessions';
import { POST as createSession } from '@/app/api/sessions/route';
import { GET as getSession } from '@/app/api/sessions/admin/[adminId]/route';
import { POST as join } from '@/app/api/sessions/[id]/workers/route';
import { GET as getWorker } from '@/app/api/workers/[id]/route';
import { GET as getLesson } from '@/app/api/workers/[id]/lesson/route';
import { POST as answers } from '@/app/api/workers/[id]/answers/route';
import { POST as retry } from '@/app/api/workers/[id]/retry/route';
import { POST as approve } from '@/app/api/workers/[id]/approve/route';

const post = (body: unknown) =>
  new Request('http://x/api', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const adminCtx = (adminId: string) => ({ params: Promise.resolve({ adminId }) });
const keyed = (key: string) => new Request(`http://x/api?key=${key}`, { method: 'POST' });
const rightAnswers = mockLesson.quiz.map((q) => q.answerIndex);

async function setup() {
  const { id, adminId } = await (await createSession(post({ instruction: '안전모를 쓰세요' }))).json();
  const { workerId } = await (await join(post({ name: '민수', lang: 'vi' }), ctx(id))).json();
  return { id, adminId, workerId };
}

beforeEach(async () => {
  await initDb();
  await getDb().batch(['DELETE FROM sessions', 'DELETE FROM workers', 'DELETE FROM lessons', 'DELETE FROM llm_calls']);
});

afterEach(() => vi.unstubAllEnvs());

test('POST /api/sessions with empty instruction → 400', async () => {
  const res = await createSession(post({ instruction: '' }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: expect.any(String) });
});

test('POST /api/sessions with invalid JSON or missing field → 400', async () => {
  expect((await createSession(post('{not json'))).status).toBe(400);
  expect((await createSession(post({}))).status).toBe(400);
});

test('join with unsupported lang → 400', async () => {
  const { id } = await setup();
  expect((await join(post({ name: 'a', lang: 'fr' }), ctx(id))).status).toBe(400);
});

test('join unknown session → 404', async () => {
  expect((await join(post({ name: 'a', lang: 'vi' }), ctx('nope'))).status).toBe(404);
});

test('GET unknown session and worker → 404', async () => {
  expect((await getSession(new Request('http://x'), adminCtx('nope'))).status).toBe(404);
  expect((await getWorker(new Request('http://x'), ctx('nope'))).status).toBe(404);
});

test('answers with malformed body → 400', async () => {
  const { workerId } = await setup();
  for (const body of [{ level: 0, answers: [3] }, { level: -1, answers: [] }, { level: 0, answers: [0, 0, 0, 0] }, { level: 0 }]) {
    expect((await answers(post(body), ctx(workerId))).status).toBe(400);
  }
});

test('stale answers → 409', async () => {
  const { adminId, workerId } = await setup();
  await retry(keyed(adminId), ctx(workerId));
  const res = await answers(post({ level: 0, answers: rightAnswers }), ctx(workerId));
  expect(res.status).toBe(409);
});

test('retry and approve without or with a wrong key → 403, right key → ok', async () => {
  const { id, adminId, workerId } = await setup();
  for (const act of [retry, approve]) {
    for (const req of [post({}), keyed(''), keyed('wrong'), keyed(id)]) {
      expect((await act(req, ctx(workerId))).status).toBe(403);
    }
  }
  expect(await (await getWorker(new Request('http://x'), ctx(workerId))).json()).toMatchObject({ status: 'pending', level: 0 });
  expect((await retry(keyed(adminId), ctx(workerId))).status).toBe(200);
  expect((await approve(keyed(adminId), ctx(workerId))).status).toBe(200);
});

test('join id cannot read the admin view', async () => {
  const { id } = await setup();
  expect((await getSession(new Request('http://x'), adminCtx(id))).status).toBe(404);
});

test('lesson when rate limited → 429', async () => {
  vi.stubEnv('LLM_HOURLY_CAP', '0');
  const { workerId } = await setup();
  const res = await getLesson(new Request('http://x'), ctx(workerId));
  expect(res.status).toBe(429);
});

test('full flow: create → join → lesson → answers → retry → approve', async () => {
  const { id, adminId, workerId } = await setup();

  const session = await (await getSession(new Request('http://x'), adminCtx(adminId))).json();
  expect(session).toMatchObject({ id, instructionKo: '안전모를 쓰세요', mock: true });
  expect(session.workers).toEqual([{ id: workerId, sessionId: id, name: '민수', lang: 'vi', status: 'pending', level: 0 }]);

  const lessonRes = await (await getLesson(new Request('http://x'), ctx(workerId))).json();
  expect(lessonRes).toMatchObject({ mock: true, level: 0 });
  expect(lessonRes.lesson.quiz).toHaveLength(mockLesson.quiz.length);
  expect(JSON.stringify(lessonRes)).not.toContain('answerIndex');

  expect(await (await answers(post({ level: 0, answers: [] }), ctx(workerId))).json()).toEqual({ passed: false });
  expect((await (await getWorker(new Request('http://x'), ctx(workerId))).json()).status).toBe('failed');

  expect(await (await retry(keyed(adminId), ctx(workerId))).json()).toEqual({ ok: true });
  const w = await (await getWorker(new Request('http://x'), ctx(workerId))).json();
  expect(w).toMatchObject({ status: 'pending', level: 1 });
  expect((await (await getLesson(new Request('http://x'), ctx(workerId))).json()).level).toBe(1);

  expect(await (await answers(post({ level: 1, answers: rightAnswers }), ctx(workerId))).json()).toEqual({ passed: true });

  expect(await (await approve(keyed(adminId), ctx(workerId))).json()).toEqual({ ok: true });
  expect((await (await getWorker(new Request('http://x'), ctx(workerId))).json()).status).toBe('approved');
});

test('toResponse maps errors to status codes and hides 500 details', async () => {
  const status = (e: unknown) => toResponse(e).status;
  expect(status(new ValidationError('x'))).toBe(400);
  expect(status(new ForbiddenError('x'))).toBe(403);
  expect(status(new NotFoundError('x'))).toBe(404);
  expect(status(new StaleLevelError('x'))).toBe(409);
  expect(status(new RateLimitError('x'))).toBe(429);
  expect(status(new LlmError('x'))).toBe(502);

  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = toResponse(new Error('db password leaked'));
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('leaked');
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
