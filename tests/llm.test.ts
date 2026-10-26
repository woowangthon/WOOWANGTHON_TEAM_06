import { expect, test, vi } from 'vitest';
import { LessonSchema } from '@/lib/types';
import { mockLesson } from '@/lib/fixtures/mock-lesson';
import { LlmError, generateLesson, parseLessonWithRetry } from '@/lib/llm';

test('mock mode returns valid lesson without API', async () => {
  const l = await generateLesson('프레스 작업 전 양손 버튼 확인', 'vi', 0);
  expect(LessonSchema.safeParse(l).success).toBe(true);
});

test('retries once on invalid output then succeeds', async () => {
  const call = vi.fn().mockResolvedValueOnce({ bad: 1 }).mockResolvedValueOnce(mockLesson);
  await expect(parseLessonWithRetry(call)).resolves.toEqual(mockLesson);
  expect(call).toHaveBeenCalledTimes(2);
});

test('throws LlmError after second invalid output', async () => {
  const call = vi.fn().mockResolvedValue(null);
  await expect(parseLessonWithRetry(call)).rejects.toBeInstanceOf(LlmError);
  expect(call).toHaveBeenCalledTimes(2);
});
