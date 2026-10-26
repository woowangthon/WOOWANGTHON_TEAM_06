import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getDb, initDb } from '@/lib/db';
import { mockLesson } from '@/lib/fixtures/mock-lesson';
import { generateLesson, isMock } from '@/lib/llm';
import { RateLimitError, getLesson, hourlyCap } from '@/lib/lessons';

vi.mock('@/lib/llm', async () => {
  const { mockLesson } = await import('@/lib/fixtures/mock-lesson');
  return { generateLesson: vi.fn().mockResolvedValue(mockLesson), isMock: vi.fn(() => true) };
});

beforeEach(async () => {
  await initDb();
  await getDb().batch(['DELETE FROM lessons', 'DELETE FROM llm_calls']);
  vi.mocked(generateLesson).mockClear();
  vi.mocked(isMock).mockReturnValue(true);
});

afterEach(() => vi.unstubAllEnvs());

test('second call is cache hit', async () => {
  await getLesson('지시', 'vi', 0);
  await getLesson('지시', 'vi', 0);
  expect(generateLesson).toHaveBeenCalledTimes(1);
});

test('different level is a new lesson', async () => {
  await getLesson('지시', 'vi', 0);
  await getLesson('지시', 'vi', 1);
  expect(generateLesson).toHaveBeenCalledTimes(2);
});

test('mock flag is returned, also from cache', async () => {
  expect((await getLesson('지시', 'vi', 0)).mock).toBe(true);
  expect(await getLesson('지시', 'vi', 0)).toEqual({ lesson: mockLesson, mock: true });
});

test('throws RateLimitError past hourly cap', async () => {
  vi.stubEnv('LLM_HOURLY_CAP', '1');
  await getLesson('a', 'vi', 0);
  await expect(getLesson('b', 'vi', 0)).rejects.toBeInstanceOf(RateLimitError);
});

test('cap 0 blocks every cache miss without calling the llm', async () => {
  vi.stubEnv('LLM_HOURLY_CAP', '0');
  await expect(getLesson('a', 'vi', 0)).rejects.toBeInstanceOf(RateLimitError);
  expect(generateLesson).not.toHaveBeenCalled();
});

test('cache hits do not count toward the cap', async () => {
  vi.stubEnv('LLM_HOURLY_CAP', '1');
  await getLesson('a', 'vi', 0);
  await expect(getLesson('a', 'vi', 0)).resolves.toBeDefined();
});

test('mock-mode cache entry is not served in real mode', async () => {
  await getLesson('지시', 'vi', 0);
  vi.mocked(isMock).mockReturnValue(false);
  expect((await getLesson('지시', 'vi', 0)).mock).toBe(false);
  expect(generateLesson).toHaveBeenCalledTimes(2);
});

test('switching LLM_MODEL does not reuse a real-mode cache entry', async () => {
  vi.mocked(isMock).mockReturnValue(false);
  vi.stubEnv('LLM_MODEL', 'model-a');
  await getLesson('지시', 'vi', 0);
  vi.stubEnv('LLM_MODEL', 'model-b');
  await getLesson('지시', 'vi', 0);
  expect(generateLesson).toHaveBeenCalledTimes(2);
});

test('hourlyCap falls back to 100 for blank or non-numeric values and keeps 0', () => {
  for (const [v, cap] of [['', 100], ['abc', 100], ['0', 0], ['5', 5]] as const) {
    vi.stubEnv('LLM_HOURLY_CAP', v);
    expect(hourlyCap()).toBe(cap);
  }
});
