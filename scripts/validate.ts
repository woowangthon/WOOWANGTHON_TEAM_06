import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import items from '../data/validation/instructions.json';
import { backTranslate, generateLesson, isMock, judgeQuiz, judgeSimilarity } from '../lib/llm';
import { LANGS, type Lang } from '../lib/types';

export type Row = {
  id: number;
  lang: Lang;
  similarity: number;
  coversCore: boolean;
  singleAnswer: boolean;
  reason?: string;
  error?: string;
};

export async function runValidation(list: { id: number; text: string }[], langs: Lang[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const { id, text } of list) {
    for (const lang of langs) {
      try {
        const lesson = await generateLesson(text, lang, 0);
        const sim = await judgeSimilarity(text, await backTranslate(lesson));
        const quiz = await judgeQuiz(text, lesson);
        rows.push({ id, lang, similarity: sim.score, reason: sim.reason, ...quiz });
      } catch (e) {
        rows.push({ id, lang, similarity: 0, coversCore: false, singleAnswer: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return rows;
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');

export function summarize(rows: Row[]): string {
  const langs = [...new Set(rows.map((r) => r.lang))];
  const table = langs.map((lang) => {
    const all = rows.filter((r) => r.lang === lang);
    const ok = all.filter((r) => !r.error);
    const avg = ok.length ? (ok.reduce((s, r) => s + r.similarity, 0) / ok.length).toFixed(2) : '-';
    const cnt = (k: 'coversCore' | 'singleAnswer') => pct(ok.filter((r) => r[k]).length, ok.length);
    return `| ${lang} | ${avg} | ${cnt('coversCore')} | ${cnt('singleAnswer')} | ${all.length - ok.length} |`;
  });
  const failed = rows.filter((r) => r.error).map((r) => `- #${r.id} ${r.lang}: ${r.error}`);
  const lowest = rows
    .filter((r) => !r.error)
    .sort((a, b) => a.similarity - b.similarity)
    .slice(0, 5)
    .map((r) => `- #${r.id} ${r.lang}: ${r.similarity} — ${r.reason ?? ''}`);
  return [
    '| 언어 | 평균 역번역 일치도 (1-5) | 핵심 포함률 (%) | 정답 유일률 (%) | 실패 건수 |',
    '|---|---|---|---|---|',
    ...table,
    '',
    '평균·비율은 성공한 건만 대상으로 하며, 실패 건은 실패 건수로만 집계한다.',
    '',
    '## 실패 항목',
    ...(failed.length ? failed : ['- 없음']),
    '',
    '## 일치도 낮은 5건 (직접 확인 대상)',
    ...(lowest.length ? lowest : ['- 없음']),
  ].join('\n');
}

export function reportFor(rows: Row[], langs: Lang[], itemCount: number) {
  const model = process.env.LLM_MODEL ?? 'claude-haiku-5-5';
  const date = new Date().toISOString().slice(0, 10);
  const mock = isMock();
  const header = [
    ...(mock ? ['> ⚠️ 샘플 데이터(모킹) — 실제 API 결과 아님', ''] : []),
    '# 번역·퀴즈 품질 검증',
    '',
    `- 모델: ${model}`,
    `- 날짜: ${date}`,
    `- 언어: ${langs.join(', ')}`,
    `- 문장 수: ${itemCount}`,
    '',
  ];
  return {
    filename: `validation-${model}${mock ? '-MOCK' : ''}-${date}.md`,
    content: [...header, summarize(rows), ''].join('\n'),
  };
}

async function main() {
  const arg = process.argv.indexOf('--langs');
  const langs = (arg > 0 ? process.argv[arg + 1] : 'vi,ne,en').split(',') as Lang[];
  const bad = langs.filter((l) => !LANGS.includes(l));
  if (bad.length) throw new Error(`unknown langs: ${bad.join(',')}`);
  const { filename, content } = reportFor(await runValidation(items, langs), langs, items.length);
  mkdirSync('results', { recursive: true });
  writeFileSync(`results/${filename}`, content);
  console.log(`results/${filename}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
