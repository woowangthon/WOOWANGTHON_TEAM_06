import { z } from 'zod';

export const LANGS = ['vi', 'ne', 'en', 'km', 'id', 'uz', 'my', 'th', 'mn', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  vi: '베트남어',
  ne: '네팔어',
  en: '영어',
  km: '크메르어',
  id: '인도네시아어',
  uz: '우즈베크어',
  my: '미얀마어',
  th: '태국어',
  mn: '몽골어',
  zh: '중국어',
};

const Item = z.object({ emoji: z.string(), text: z.string() });

export const LessonSchema = z.object({
  steps: z.array(Item).min(1).max(6),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(Item).length(3),
        answerIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      }),
    )
    .min(2)
    .max(3),
  ui: z.object({
    submit: z.string(),
    passed: z.string(),
    failed: z.string(),
    waiting: z.string(),
  }),
});
export type Lesson = z.infer<typeof LessonSchema>;

export type WorkerStatus = 'pending' | 'passed' | 'failed' | 'approved';

export type Worker = {
  id: string;
  sessionId: string;
  name: string;
  lang: Lang;
  status: WorkerStatus;
  level: number;
};
