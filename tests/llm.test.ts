import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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

describe('real mode with stubbed SDK', () => {
  const parse = vi.fn();
  beforeEach(() => {
    vi.stubEnv('LLM_MOCK', '0');
    vi.stubEnv('ANTHROPIC_API_KEY', 'dummy');
    parse.mockReset();
    vi.resetModules();
    vi.doMock('@anthropic-ai/sdk', async (orig) => {
      const sdk = await orig<typeof import('@anthropic-ai/sdk')>();
      return { ...sdk, default: class { messages = { parse }; } };
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@anthropic-ai/sdk');
  });

  test('retries when the SDK throws a parse error', async () => {
    const { AnthropicError } = await import('@anthropic-ai/sdk');
    parse
      .mockRejectedValueOnce(new AnthropicError('Failed to parse structured output'))
      .mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: mockLesson });
    const { generateLesson } = await import('@/lib/llm');
    await expect(generateLesson('x', 'vi', 0)).resolves.toEqual(mockLesson);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  test('throws LlmError when the SDK keeps failing to parse', async () => {
    const { AnthropicError } = await import('@anthropic-ai/sdk');
    parse.mockRejectedValue(new AnthropicError('bad json'));
    const { generateLesson, LlmError } = await import('@/lib/llm');
    await expect(generateLesson('x', 'vi', 0)).rejects.toBeInstanceOf(LlmError);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  test('API errors propagate without retry', async () => {
    const { APIError } = await import('@anthropic-ai/sdk');
    const err = new APIError(500, undefined, 'boom', undefined);
    parse.mockRejectedValue(err);
    const { generateLesson } = await import('@/lib/llm');
    await expect(generateLesson('x', 'vi', 0)).rejects.toBe(err);
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
