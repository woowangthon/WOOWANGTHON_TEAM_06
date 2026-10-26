import { beforeEach, expect, test } from 'vitest';
import { getDb, initDb } from '@/lib/db';
import { mockLesson } from '@/lib/fixtures/mock-lesson';
import {
  ForbiddenError,
  NotFoundError,
  StaleLevelError,
  ValidationError,
  approveWorker,
  createSession,
  getSession,
  getSessionByAdmin,
  getWorker,
  grade,
  joinSession,
  requestRetry,
  submitAnswers,
} from '@/lib/sessions';

const rightAnswers = mockLesson.quiz.map((q) => q.answerIndex as number);
const wrongAnswers = mockLesson.quiz.map((q) => (q.answerIndex + 1) % 3);

beforeEach(async () => {
  await initDb();
  await getDb().batch(['DELETE FROM sessions', 'DELETE FROM workers']);
});

test('rejects empty and 501-char instruction', async () => {
  await expect(createSession('   ')).rejects.toBeInstanceOf(ValidationError);
  await expect(createSession('가'.repeat(501))).rejects.toBeInstanceOf(ValidationError);
});

test('one wrong answer fails', () => {
  expect(grade(mockLesson, [mockLesson.quiz[0].answerIndex, (mockLesson.quiz[1].answerIndex + 1) % 3])).toBe(false);
});

test('grade passes only on full match of equal length', () => {
  expect(grade(mockLesson, rightAnswers)).toBe(true);
  expect(grade(mockLesson, rightAnswers.slice(1))).toBe(false);
});

test('stores trimmed instruction and name; getSession lists workers in join order', async () => {
  const { id: s, adminId } = await createSession('  지시  ');
  await joinSession(s, ' Nguyen ', 'vi');
  await joinSession(s, 'Ram', 'ne');
  const session = await getSession(s);
  expect(session).toMatchObject({ id: s, instructionKo: '지시' });
  expect(session!.workers.map((w) => w.name)).toEqual(['Nguyen', 'Ram']);
  expect(session!.workers[0]).toMatchObject({ sessionId: s, lang: 'vi', status: 'pending', level: 0 });
  expect(await getSession('nope')).toBeNull();
  expect(await getSessionByAdmin(adminId)).toMatchObject({ id: s, instructionKo: '지시' });
  expect(await getSessionByAdmin(s)).toBeNull();
  expect(adminId).not.toBe(s);
});

test('joinSession validates name', async () => {
  const { id: s } = await createSession('지시');
  await expect(joinSession(s, '  ', 'vi')).rejects.toBeInstanceOf(ValidationError);
  await expect(joinSession(s, 'a'.repeat(31), 'vi')).rejects.toBeInstanceOf(ValidationError);
});

test('wrong answer → failed, retry → pending level 1, right answer → passed', async () => {
  const { id: s, adminId } = await createSession('지시');
  const w = await joinSession(s, 'Nguyen', 'vi');
  expect(await submitAnswers(w, 0, wrongAnswers)).toEqual({ passed: false });
  expect((await getWorker(w))!.status).toBe('failed');
  await requestRetry(w, adminId);
  expect(await getWorker(w)).toMatchObject({ status: 'pending', level: 1 });
  expect(await submitAnswers(w, 1, rightAnswers)).toEqual({ passed: true });
  expect((await getWorker(w))!.status).toBe('passed');
  await approveWorker(w, adminId);
  expect((await getWorker(w))!.status).toBe('approved');
});

test('stale level submit is rejected and status unchanged', async () => {
  const { id: s, adminId } = await createSession('지시');
  const w = await joinSession(s, 'Nguyen', 'vi');
  await requestRetry(w, adminId);
  await expect(submitAnswers(w, 0, rightAnswers)).rejects.toBeInstanceOf(StaleLevelError);
  expect(await getWorker(w)).toMatchObject({ status: 'pending', level: 1 });
});

test('unknown ids throw NotFoundError', async () => {
  await expect(joinSession('nope', 'Nguyen', 'vi')).rejects.toBeInstanceOf(NotFoundError);
  await expect(submitAnswers('nope', 0, [])).rejects.toBeInstanceOf(NotFoundError);
  await expect(requestRetry('nope', 'k')).rejects.toBeInstanceOf(NotFoundError);
  await expect(approveWorker('nope', 'k')).rejects.toBeInstanceOf(NotFoundError);
  expect(await getWorker('nope')).toBeNull();
});

test('retry and approve need the session admin key', async () => {
  const { id: s, adminId } = await createSession('지시');
  const other = await createSession('다른 지시');
  const w = await joinSession(s, 'Nguyen', 'vi');
  for (const key of ['', s, other.adminId]) {
    await expect(requestRetry(w, key)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(approveWorker(w, key)).rejects.toBeInstanceOf(ForbiddenError);
  }
  expect(await getWorker(w)).toMatchObject({ status: 'pending', level: 0 });
  await requestRetry(w, adminId);
  expect((await getWorker(w))!.level).toBe(1);
});

test('failed worker cannot resubmit at the same level', async () => {
  const { id: s } = await createSession('지시');
  const w = await joinSession(s, 'Nguyen', 'vi');
  await submitAnswers(w, 0, wrongAnswers);
  await expect(submitAnswers(w, 0, rightAnswers)).rejects.toBeInstanceOf(StaleLevelError);
  expect((await getWorker(w))!.status).toBe('failed');
});

test('approved worker cannot be downgraded by a late submit', async () => {
  const { id: s, adminId } = await createSession('지시');
  const w = await joinSession(s, 'Nguyen', 'vi');
  await approveWorker(w, adminId);
  await expect(submitAnswers(w, 0, wrongAnswers)).rejects.toBeInstanceOf(StaleLevelError);
  expect((await getWorker(w))!.status).toBe('approved');
});
