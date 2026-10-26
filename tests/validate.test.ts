import { expect, test } from 'vitest';
import items from '@/data/validation/instructions.json';
import { reportFor, runValidation, summarize, type Row } from '@/scripts/validate';

const sampleRows: Row[] = [
  { id: 1, lang: 'vi', similarity: 5, coversCore: true, singleAnswer: true },
  { id: 2, lang: 'vi', similarity: 3, coversCore: false, singleAnswer: true, reason: 'dropped warning' },
  { id: 3, lang: 'vi', similarity: 0, coversCore: false, singleAnswer: false, error: 'boom' },
  { id: 1, lang: 'en', similarity: 4, coversCore: true, singleAnswer: true },
];

test('dataset has 30 items with unique ids and a source each', () => {
  expect(items).toHaveLength(30);
  expect(new Set(items.map((i) => i.id)).size).toBe(30);
  expect(items.every((i) => i.text && i.source)).toBe(true);
});

test('runValidation produces one row per item×lang', async () => {
  const rows = await runValidation(items.slice(0, 2), ['vi', 'en']);
  expect(rows).toHaveLength(4);
  expect(rows.every((r) => !r.error)).toBe(true);
});

test('summarize shows per-language averages over successful rows only', () => {
  const md = summarize(sampleRows);
  expect(md).toContain('| vi | 4.00 | 50% | 100% | 1 |');
  expect(md).toContain('| en | 4.00 | 100% | 100% | 0 |');
  expect(md).toContain('- #3 vi: boom');
  expect(md).toContain('- #2 vi: 3 — dropped warning');
});

test('mock runs are labelled in filename and first line', () => {
  const { filename, content } = reportFor(sampleRows, ['vi', 'en'], 3);
  expect(filename).toMatch(/^validation-.+-MOCK-\d{4}-\d{2}-\d{2}\.md$/);
  expect(content.startsWith('> ⚠️ 샘플 데이터(모킹) — 실제 API 결과 아님')).toBe(true);
});
