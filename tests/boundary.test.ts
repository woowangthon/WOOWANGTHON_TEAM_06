import { expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findSdkImporters } from '@/lib/boundary';

const SKIP = new Set(['node_modules', '.next']);
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    SKIP.has(e.name) ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

const root = path.resolve(import.meta.dirname, '..');
const repoFiles = ['app', 'components', 'lib', 'scripts']
  .flatMap((d) => (readdirSync(root).includes(d) ? walk(path.join(root, d)) : []))
  .filter((f) => /\.(ts|tsx|mjs)$/.test(f))
  .map((f) => ({ path: path.relative(root, f).split(path.sep).join('/'), content: readFileSync(f, 'utf8') }));

const flagged = (content: string) => findSdkImporters([{ path: 'x.ts', content }]).length === 1;

test('checker flags a violating file', () => {
  expect(findSdkImporters([{ path: 'app/x.ts', content: "import Anthropic from '@anthropic-ai/sdk'" }])).toEqual(['app/x.ts']);
});

test('checker flags subpath, side-effect, dynamic and require forms', () => {
  expect(flagged("import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';")).toBe(true);
  expect(flagged('import Anthropic from "@anthropic-ai/sdk"')).toBe(true);
  expect(flagged("import '@anthropic-ai/sdk'")).toBe(true);
  expect(flagged("const A = await import('@anthropic-ai/sdk')")).toBe(true);
  expect(flagged("const A = require('@anthropic-ai/sdk')")).toBe(true);
  expect(flagged('const A = require("@anthropic-ai/sdk/helpers/zod")')).toBe(true);
});

test('checker ignores unrelated mentions and returns sorted paths', () => {
  expect(flagged('// anthropic is the vendor; see @anthropic-ai docs')).toBe(false);
  expect(flagged("import x from '@anthropic-ai/other'")).toBe(false);
  expect(
    findSdkImporters([
      { path: 'b.ts', content: "import A from '@anthropic-ai/sdk'" },
      { path: 'a.ts', content: "require('@anthropic-ai/sdk')" },
      { path: 'c.ts', content: 'const anthropic = 1' },
    ]),
  ).toEqual(['a.ts', 'b.ts']);
});

test('only lib/llm.ts imports the SDK — exactly', () => {
  expect(findSdkImporters(repoFiles)).toEqual(['lib/llm.ts']);
});

test('tests never see a real API key', () => {
  expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(process.env.LLM_MOCK).toBe('1');
});
