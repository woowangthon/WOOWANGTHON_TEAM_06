import Anthropic, { AnthropicError, APIError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { mockLesson } from '@/lib/fixtures/mock-lesson';
import { LANG_LABELS, LessonSchema, type Lang, type Lesson } from '@/lib/types';

export class LlmError extends Error {}

export const isMock = () => process.env.LLM_MOCK === '1' || !process.env.ANTHROPIC_API_KEY;

let client: Anthropic | undefined;

async function ask<T extends z.ZodType>(prompt: string, schema: T): Promise<z.infer<T> | null> {
  client ??= new Anthropic();
  try {
    const res = await client.messages.parse({
      model: process.env.LLM_MODEL ?? 'claude-haiku-5-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
    });
    return res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens' ? null : res.parsed_output;
  } catch (e) {
    if (e instanceof AnthropicError && !(e instanceof APIError)) return null;
    throw e;
  }
}

async function askOnce<T extends z.ZodType>(prompt: string, schema: T): Promise<z.infer<T>> {
  const out = await ask(prompt, schema);
  if (out == null) throw new LlmError('LLM returned no valid output');
  return out;
}

export async function parseLessonWithRetry(call: () => Promise<unknown>): Promise<Lesson> {
  for (let i = 0; i < 2; i++) {
    const parsed = LessonSchema.safeParse(await call());
    if (parsed.success) return parsed.data;
  }
  throw new LlmError('LLM returned invalid lesson twice');
}

export async function generateLesson(instructionKo: string, lang: Lang, level: number): Promise<Lesson> {
  if (isMock()) return mockLesson;
  const easier =
    level >= 1
      ? `\nThe worker did not understand a simpler version (level ${level}). Use even shorter sentences, easier everyday words, and split the instruction into smaller steps.`
      : '';
  const prompt = `You are a workplace safety trainer for foreign factory workers in Korea.
A Korean supervisor wrote this work instruction:
"${instructionKo}"

Teach it to a worker whose language is ${LANG_LABELS[lang]} (${lang}). Rules:
- Write everything ONLY in ${LANG_LABELS[lang]} (${lang}). No Korean.
- Explain technical terms in simple words.
- Make 1 to 6 short steps. Each step has exactly one emoji and one sentence.
- Make 2 to 3 multiple-choice comprehension questions. Each has exactly 3 options, each with exactly one emoji, and exactly one correct option (answerIndex 0, 1 or 2; vary it across questions).
- Include "ui" button/status texts in ${LANG_LABELS[lang]}: submit, passed, failed, waiting (waiting for the supervisor's approval).${easier}`;
  return parseLessonWithRetry(() => ask(prompt, LessonSchema));
}

export async function backTranslate(lesson: Lesson): Promise<string> {
  if (isMock()) return '프레스 작업 전에 양손 버튼이 모두 작동하는지 확인하세요.';
  const prompt = `Translate the following lesson into natural Korean, faithfully, without adding or dropping meaning. Include the steps and the quiz questions with their options. Return the full Korean text.

${JSON.stringify(lesson)}`;
  const { text } = await askOnce(prompt, z.object({ text: z.string() }));
  return text;
}

const Similarity = z.object({
  score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  reason: z.string(),
});

export async function judgeSimilarity(originalKo: string, backKo: string) {
  if (isMock()) return { score: 5 as const, reason: 'mock' };
  const prompt = `Compare the meaning of two Korean texts. Score 1 (meaning lost or reversed) to 5 (same meaning, nothing missing). Safety-critical details count most.

Original:
${originalKo}

Back-translated:
${backKo}`;
  return askOnce(prompt, Similarity);
}

const QuizJudgement = z.object({ coversCore: z.boolean(), singleAnswer: z.boolean() });

export async function judgeQuiz(instructionKo: string, lesson: Lesson) {
  if (isMock()) return { coversCore: true, singleAnswer: true };
  const prompt = `Original Korean work instruction:
"${instructionKo}"

Lesson quiz (may be in another language):
${JSON.stringify(lesson.quiz)}

Judge: coversCore = true if the questions test the core safety point(s) of the instruction. singleAnswer = true if every question has exactly one clearly correct option at its answerIndex and the other options are clearly wrong.`;
  return askOnce(prompt, QuizJudgement);
}
