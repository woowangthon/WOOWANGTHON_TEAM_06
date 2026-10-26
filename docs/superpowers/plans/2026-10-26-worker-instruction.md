# 외국인 근로자 작업지시 이해확인 동료 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 반장이 한국어 지시를 입력하면 근로자 폰에 모국어+그림 설명과 객관식 확인질문이 뜨고, 틀린 사람이 반장 화면에 🔴로 표시되는 웹앱.

**Architecture:** Next.js 앱 하나(화면 + API 라우트). 데이터는 libSQL(로컬은 파일, 배포는 Turso). LLM 호출은 `lib/llm.ts` 한 파일에만 있고, 생성된 설명·퀴즈는 (지시문, 언어, 단계) 키로 DB에 캐싱. 반장 화면은 3초 폴링으로 갱신.

**Tech Stack:** Next.js (App Router) + TypeScript, vitest, `@libsql/client`, `zod`, `@anthropic-ai/sdk`, `qrcode`. 배포 Vercel + Turso. 음성 입력은 브라우저 Web Speech API, 그림은 이모지.

**Spec:** `docs/superpowers/specs/2026-10-26-worker-instruction-design.md`

## Global Constraints

- 정규 제출 마감 **2026-11-15(일) 18:00**. 마감 시점 main 커밋이 평가 대상
- GitHub 저장소 **Public**, 이름 `WOOWANGTHON_TEAM_{팀번호}_{접미사}` (팀번호는 디스코드 공지, 1개 저장소일 때 접미사는 운영진 확인)
- LLM 호출 코드는 **`lib/llm.ts` 한 파일에만** 둔다. 다른 파일은 `@anthropic-ai/sdk`를 import하지 않는다
- 개발·테스트 중 실제 API 호출 금지. `LLM_MOCK=1`이거나 `ANTHROPIC_API_KEY`가 없으면 mock 응답. **실제 API는 `scripts/validate.ts` 1회 실행 + 배포 서비스에서만**
- mock 응답이 화면에 나갈 때는 반드시 "샘플 데이터(모킹)" 배지 표시 (대회 규정: 고정 결과를 실작동처럼 제시 금지)
- 모델 `process.env.LLM_MODEL ?? 'claude-haiku-5-5'` (품질 부족 시 `claude-sonnet-5-5`로 교체), `output_config.effort: "medium"` 명시. `temperature`/`top_p`/`top_k` 보내지 않음 (400)
- 로그인 없음. 세션·근로자 ID는 `crypto.randomUUID()`
- LLM 호출 상한: 캐시 미스 기준 **시간당 100회** (`LLM_HOURLY_CAP`, 기본 100). 넘으면 429
- 지시문 길이 1~500자 (trim 후)
- 확인질문 2~3개, 보기 3개, 1개라도 틀리면 `failed`
- 지원 언어(드롭다운 고정 목록): `vi` 베트남어, `ne` 네팔어, `en` 영어, `km` 크메르어, `id` 인도네시아어, `uz` 우즈베크어, `my` 미얀마어, `th` 태국어, `mn` 몽골어, `zh` 중국어
- 근로자 화면 문구(버튼 등)도 LLM이 lesson과 함께 근로자 언어로 생성 (i18n 라이브러리 안 씀)

## Review Focus

1. **mock이 배포에서 켜진 채 나감** → 근로자·반장 화면 모두 배지가 보여야 함. Task 3 테스트: `getLesson` 결과에 `mock: true`; Task 6·7 수동 확인에 배지 확인 포함
2. **LLM이 깨진 JSON / 범위 밖 `answerIndex` 반환** → zod 검증 실패 시 1회 재시도, 그래도 실패면 `LlmError`. Task 2 테스트
3. **근로자가 새로고침·폰 잠금 후 복귀** → 같은 lesson이 다시 뜨고 LLM 재호출 없음 (캐시 히트). Task 3 테스트
4. **재설명 요청 후 옛 화면에서 답 제출** → `level` 불일치면 `StaleLevelError`(409), 상태 안 바뀜. Task 4 테스트
5. **시간당 상한 초과 / API 장애** → 근로자 화면에 "잠시 후 다시" 안내, 반장 대시보드는 계속 동작. Task 3 테스트(429) + Task 7 수동 확인

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/types.ts` | `Lang`, `LANGS`, `Lesson`, `Worker`, `WorkerStatus` 타입·스키마 |
| `lib/db.ts` | libSQL 클라이언트 + 테이블 생성 |
| `lib/llm.ts` | **유일한 LLM 호출 파일**: lesson 생성, 역번역, 검증 판정, mock |
| `lib/lessons.ts` | 캐시 + 시간당 상한 + `getLesson` |
| `lib/sessions.ts` | 세션·근로자 상태, 채점 |
| `app/api/**/route.ts` | 얇은 HTTP 래퍼 |
| `app/page.tsx`, `app/s/[id]/page.tsx` | 반장: 지시 입력, 대시보드 |
| `app/j/[id]/page.tsx`, `app/w/[id]/page.tsx` | 근로자: 참여, 설명+퀴즈 |
| `scripts/validate.ts`, `data/validation/instructions.json` | 검증 30건 실행 |
| `tests/*.test.ts` | vitest |

---

### Task 1: 프로젝트 뼈대 + DB

**Files:**
- Create: Next.js 기본 파일(`create-next-app`), `vitest.config.ts`, `tests/setup.ts`, `lib/types.ts`, `lib/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `lib/types.ts`: `LANGS = ['vi','ne','en','km','id','uz','my','th','mn','zh'] as const`, `type Lang = typeof LANGS[number]`, `LANG_LABELS: Record<Lang, string>` (한국어 이름), `LessonSchema` (zod) + `type Lesson = z.infer<typeof LessonSchema>`, `type WorkerStatus = 'pending'|'passed'|'failed'|'approved'`, `type Worker = { id: string; sessionId: string; name: string; lang: Lang; status: WorkerStatus; level: number }`
  - `LessonSchema` 모양: `{ steps: {emoji: string; text: string}[] (1~6개), quiz: {question: string; options: {emoji: string; text: string}[] (정확히 3개); answerIndex: 0|1|2}[] (2~3개), ui: {submit: string; passed: string; failed: string; waiting: string} }`
  - `lib/db.ts`: `getDb(): Client` (싱글톤, URL = `process.env.DATABASE_URL ?? 'file:local.db'`, `TURSO_AUTH_TOKEN` 있으면 사용), `initDb(): Promise<void>` (IF NOT EXISTS로 아래 테이블 생성)
  - 테이블: `sessions(id TEXT PK, instruction_ko TEXT, created_at INTEGER)`, `workers(id TEXT PK, session_id TEXT, name TEXT, lang TEXT, status TEXT, level INTEGER)`, `lessons(key TEXT PK, json TEXT, mock INTEGER)`, `llm_calls(hour TEXT PK, count INTEGER)`

- [ ] **Step 1:** `git init`, `npx create-next-app@latest . --ts --app --eslint --no-tailwind --src-dir=false --import-alias "@/*"`, `npm i @libsql/client zod @anthropic-ai/sdk qrcode`, `npm i -D vitest @types/qrcode`. `.gitignore`에 `local.db`, `.env*.local` 포함 확인
- [ ] **Step 2:** `vitest.config.ts` (alias `@` → 루트, `setupFiles: ['tests/setup.ts']`), `tests/setup.ts`는 `process.env.DATABASE_URL = ':memory:'`, `process.env.LLM_MOCK = '1'`. `package.json`에 `"test": "vitest run"`
- [ ] **Step 3: 실패 테스트 작성** `tests/db.test.ts`

```ts
test('initDb creates tables', async () => {
  await initDb();
  const r = await getDb().execute("SELECT name FROM sqlite_master WHERE type='table'");
  expect(r.rows.map(x => x.name)).toEqual(expect.arrayContaining(['sessions','workers','lessons','llm_calls']));
});
test('LessonSchema rejects answerIndex 3', () => {
  expect(LessonSchema.safeParse(validLessonFixture({ answerIndex: 3 })).success).toBe(false);
});
```
(`validLessonFixture`는 테스트 파일 안 헬퍼: 유효한 Lesson 하나 만들고 첫 문제 `answerIndex`만 덮어씀)

- [ ] **Step 4:** `npm test` → FAIL (모듈 없음)
- [ ] **Step 5:** `lib/types.ts`, `lib/db.ts` 구현
- [ ] **Step 6:** `npm test` → PASS
- [ ] **Step 7:** 커밋 `chore: scaffold next app with libsql schema`

---

### Task 2: LLM 파일 (`lib/llm.ts`)

**Files:**
- Create: `lib/llm.ts`, `lib/fixtures/mock-lesson.ts`
- Test: `tests/llm.test.ts`

**Interfaces:**
- Consumes: `Lang`, `LessonSchema`, `Lesson` (Task 1)
- Produces:
  - `isMock(): boolean` — `process.env.LLM_MOCK === '1' || !process.env.ANTHROPIC_API_KEY`
  - `generateLesson(instructionKo: string, lang: Lang, level: number): Promise<Lesson>` — level 0 기본, 1 이상은 "더 짧고 쉬운 단어, 단계 더 잘게"
  - `backTranslate(lesson: Lesson): Promise<string>` — steps+quiz를 한국어로
  - `judgeSimilarity(originalKo: string, backKo: string): Promise<{ score: 1|2|3|4|5; reason: string }>`
  - `judgeQuiz(instructionKo: string, lesson: Lesson): Promise<{ coversCore: boolean; singleAnswer: boolean }>`
  - `class LlmError extends Error`
  - 테스트용 export: `parseLessonWithRetry(call: () => Promise<unknown>): Promise<Lesson>` — 결과를 `LessonSchema`로 검증, 실패 시 `call` 1회 재시도, 또 실패면 `LlmError`

- [ ] **Step 1: 실패 테스트**

```ts
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
});
```

- [ ] **Step 2:** `npm test tests/llm.test.ts` → FAIL
- [ ] **Step 3:** 구현. mock 모드면 `mockLesson` 반환(역번역/판정 mock은 고정값). 실제 모드는 `client.messages.parse({ model: process.env.LLM_MODEL ?? 'claude-haiku-5-5', max_tokens: 16000, output_config: { effort: 'medium', format: zodOutputFormat(LessonSchema) }, ... })` (`import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'`), `parsed_output`이 null이면 재시도 대상. 프롬프트 요구: 대상 언어로만, 전문용어 풀어서, 이모지 1개씩, 보기 3개 중 정답 1개, `ui` 문구 포함. `judge*`도 같은 방식으로 zod 스키마
- [ ] **Step 4:** `npm test` → PASS. `grep -rl "@anthropic-ai/sdk" app lib scripts` 결과가 `lib/llm.ts` 하나뿐인지 확인
- [ ] **Step 5:** 커밋 `feat: add llm module with mock mode and schema retry`

---

### Task 3: 캐시 + 호출 상한 (`lib/lessons.ts`)

**Files:**
- Create: `lib/lessons.ts`
- Test: `tests/lessons.test.ts`

**Interfaces:**
- Consumes: `generateLesson`, `isMock` (Task 2), `getDb`, `initDb` (Task 1)
- Produces:
  - `getLesson(instructionKo: string, lang: Lang, level: number): Promise<{ lesson: Lesson; mock: boolean }>` — 키 `sha256(instructionKo|lang|level)`, 히트면 DB에서, 미스면 상한 확인 후 생성·저장. 상한 카운트는 `llm_calls`의 `YYYY-MM-DDTHH`(UTC) 행
  - `class RateLimitError extends Error`

- [ ] **Step 1: 실패 테스트** (`vi.mock('@/lib/llm')`로 `generateLesson` 스파이)

```ts
test('second call is cache hit', async () => {
  await getLesson('지시', 'vi', 0); await getLesson('지시', 'vi', 0);
  expect(generateLesson).toHaveBeenCalledTimes(1);
});
test('different level is a new lesson', async () => {
  await getLesson('지시', 'vi', 0); await getLesson('지시', 'vi', 1);
  expect(generateLesson).toHaveBeenCalledTimes(2);
});
test('mock flag is returned', async () => {
  expect((await getLesson('지시', 'vi', 0)).mock).toBe(true);
});
test('throws RateLimitError past hourly cap', async () => {
  process.env.LLM_HOURLY_CAP = '1';
  await getLesson('a', 'vi', 0);
  await expect(getLesson('b', 'vi', 0)).rejects.toBeInstanceOf(RateLimitError);
});
```
(각 테스트 전 `lessons`, `llm_calls` 비우기)

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현 (해시는 `node:crypto` `createHash('sha256')`)
- [ ] **Step 4:** PASS 확인
- [ ] **Step 5:** 커밋 `feat: cache lessons and cap hourly llm calls`

---

### Task 4: 세션·근로자·채점 (`lib/sessions.ts`)

**Files:**
- Create: `lib/sessions.ts`
- Test: `tests/sessions.test.ts`

**Interfaces:**
- Consumes: `getLesson` (Task 3), `Worker`, `Lang`, `Lesson` (Task 1)
- Produces:
  - `createSession(instructionKo: string): Promise<string>` — trim 후 1~500자 아니면 `ValidationError`
  - `getSession(id: string): Promise<{ id: string; instructionKo: string; workers: Worker[] } | null>`
  - `joinSession(sessionId: string, name: string, lang: Lang): Promise<string>` — 이름 trim 1~30자, 세션 없으면 `NotFoundError`. 상태 `pending`, level 0
  - `getWorker(workerId: string): Promise<Worker | null>`
  - `grade(lesson: Lesson, answers: number[]): boolean` — 길이 같고 전부 `answerIndex`와 일치
  - `submitAnswers(workerId: string, level: number, answers: number[]): Promise<{ passed: boolean }>` — level 불일치 `StaleLevelError`, 결과에 따라 `passed`/`failed`
  - `requestRetry(workerId: string): Promise<void>` — level+1, `pending`
  - `approveWorker(workerId: string): Promise<void>` — `approved`
  - 에러 클래스 `ValidationError`, `NotFoundError`, `StaleLevelError`

- [ ] **Step 1: 실패 테스트**

```ts
test('rejects empty and 501-char instruction', async () => {
  await expect(createSession('   ')).rejects.toBeInstanceOf(ValidationError);
  await expect(createSession('가'.repeat(501))).rejects.toBeInstanceOf(ValidationError);
});
test('one wrong answer fails', () => {
  expect(grade(mockLesson, [mockLesson.quiz[0].answerIndex, (mockLesson.quiz[1].answerIndex + 1) % 3])).toBe(false);
});
test('wrong answer → failed, retry → pending level 1, right answer → passed', async () => {
  const s = await createSession('지시'); const w = await joinSession(s, 'Nguyen', 'vi');
  await submitAnswers(w, 0, wrongAnswers); expect((await getWorker(w))!.status).toBe('failed');
  await requestRetry(w); expect(await getWorker(w)).toMatchObject({ status: 'pending', level: 1 });
  await submitAnswers(w, 1, rightAnswers); expect((await getWorker(w))!.status).toBe('passed');
});
test('stale level submit is rejected and status unchanged', async () => {
  // join → requestRetry(level 1) → submitAnswers(w, 0, ...) rejects StaleLevelError, status 'pending'
});
test('joinSession on unknown session throws NotFoundError', async () => { /* ... */ });
```
(`rightAnswers`/`wrongAnswers`는 mock lesson의 `answerIndex`로 만듦)

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS 확인
- [ ] **Step 5:** 커밋 `feat: add session, worker state and grading`

---

### Task 5: API 라우트

**Files:**
- Create: `app/api/sessions/route.ts` (POST), `app/api/sessions/[id]/route.ts` (GET), `app/api/sessions/[id]/workers/route.ts` (POST), `app/api/workers/[id]/route.ts` (GET), `app/api/workers/[id]/lesson/route.ts` (GET), `app/api/workers/[id]/answers/route.ts` (POST), `app/api/workers/[id]/retry/route.ts` (POST), `app/api/workers/[id]/approve/route.ts` (POST), `lib/http.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: Task 4 함수 전부, `getLesson`, `RateLimitError`, `LlmError`
- Produces (JSON):
  - `POST /api/sessions {instruction}` → `{id}`
  - `GET /api/sessions/:id` → `getSession` 결과 + `mock: boolean` (= `isMock()`)
  - `POST /api/sessions/:id/workers {name, lang}` → `{workerId}`
  - `GET /api/workers/:id` → `Worker`
  - `GET /api/workers/:id/lesson` → `{lesson, mock, level}` (근로자 현재 level 기준)
  - `POST /api/workers/:id/answers {level, answers}` → `{passed}`
  - `POST /api/workers/:id/retry`, `/approve` → `{ok: true}`
  - `lib/http.ts`: `toResponse(e: unknown): Response` — `ValidationError`→400, `NotFoundError`→404, `StaleLevelError`→409, `RateLimitError`→429, `LlmError`→502, 그 외 500. 모든 라우트가 `initDb()` 후 처리

- [ ] **Step 1: 실패 테스트** (라우트 핸들러를 `new Request(...)`로 직접 호출)

```ts
test('POST /api/sessions with empty instruction → 400', async () => {
  const res = await POST(new Request('http://x/api/sessions', { method: 'POST', body: JSON.stringify({ instruction: '' }) }));
  expect(res.status).toBe(400);
});
test('stale answers → 409', async () => { /* create→join→retry→answers level 0 */ });
test('lesson when rate limited → 429', async () => { /* LLM_HOURLY_CAP=0 */ });
test('join with unsupported lang → 400', async () => { /* lang: 'fr' */ });
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현 (`lang`은 `LANGS` 포함 여부로 검증, 본문은 zod로 파싱)
- [ ] **Step 4:** PASS 확인
- [ ] **Step 5:** 커밋 `feat: add api routes`

---

### Task 6: 반장 화면

**Files:**
- Create: `app/page.tsx`, `app/s/[id]/page.tsx`, `components/MockBadge.tsx`, `components/VoiceInput.tsx`
- Modify: `app/layout.tsx` (제목, `lang="ko"`, viewport)

**Interfaces:**
- Consumes: Task 5 API
- Produces: `MockBadge({ show: boolean })` — 근로자 화면도 사용

화면 요구:
- `/`: 지시 입력 textarea(500자 카운터) + 🎤 버튼(`VoiceInput`: `window.SpeechRecognition ?? webkitSpeechRecognition`, `lang='ko-KR'`, 미지원 브라우저면 버튼 숨김) + "교육 시작" → `/s/{id}`
- `/s/[id]`: 지시문, QR(`qrcode`로 `${origin}/j/${id}` data URL), 근로자 목록 3초 폴링. 상태 표시 `pending` ⚪ 대기, `failed` 🔴 재설명 필요, `passed` 🟢 이해함, `approved` ✅ 투입. `failed`는 [다시 설명] [그래도 투입], `passed`는 [투입] 버튼. 문구는 "감시" 아닌 "재설명 필요"로
- mock이면 상단에 `MockBadge`

- [ ] **Step 1:** 구현
- [ ] **Step 2:** `npm run dev` (LLM_MOCK=1) → 브라우저에서 확인: 지시 입력 → 대시보드 이동, QR 보임, 배지 보임, 다른 탭에서 근로자 참여 시 3초 안에 목록에 ⚪ 등장, 501자 입력 시 에러 표시
- [ ] **Step 3:** `npm test` → PASS (회귀 없음)
- [ ] **Step 4:** 커밋 `feat: add supervisor pages`

---

### Task 7: 근로자 화면

**Files:**
- Create: `app/j/[id]/page.tsx`, `app/w/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 5 API, `MockBadge`, `LANGS`, `LANG_LABELS`

화면 요구:
- `/j/[id]`: 이름 입력 + 언어 드롭다운(각 언어를 **그 언어 자체 표기**로도 보여줌, 예: "Tiếng Việt (베트남어)") → `/w/{workerId}`
- `/w/[id]`: lesson 로드 → steps(이모지 크게 + 텍스트) → 퀴즈(보기 버튼 3개, 이모지 포함) → `lesson.ui.submit` → 결과 `ui.passed`/`ui.failed`. `failed`면 `ui.waiting` 표시하며 3초 폴링, `level`이 바뀌면 새 lesson 로드. 409 받으면 새로 로드
- 429/502면 "잠시 후 다시 시도" + 재시도 버튼 (이 문구만 영어+한국어 고정)
- 폰 화면 기준(최소 터치 영역 48px, 글자 18px 이상)

- [ ] **Step 1:** 구현
- [ ] **Step 2:** `npm run dev` → 폰 크기(375px) 브라우저로 데모 시나리오 전체 확인: 참여 → 설명 → 일부러 오답 → 반장 화면 🔴 → [다시 설명] → 근로자 화면 자동으로 새 설명 → 정답 → 🟢 → [투입] ✅. 새로고침해도 같은 단계 유지. `LLM_HOURLY_CAP=0`으로 재시작 시 재시도 안내 보이고 반장 화면은 정상
- [ ] **Step 3:** `npm test` → PASS
- [ ] **Step 4:** 커밋 `feat: add worker pages`

---

### Task 8: 검증 스크립트 (실제 API 1회)

**Files:**
- Create: `data/validation/instructions.json`, `scripts/validate.ts`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Consumes: `generateLesson`, `backTranslate`, `judgeSimilarity`, `judgeQuiz` (Task 2)
- Produces:
  - `instructions.json`: `{ id: number; text: string; source: string }[]` 30건 (KOSHA 공개 안전수칙·작업표준에서 제조업 작업지시 문장, `source`에 출처 URL)
  - `scripts/validate.ts`: `runValidation(items, langs: Lang[]): Promise<Row[]>`, `Row = { id; lang; similarity: number; coversCore: boolean; singleAnswer: boolean; error?: string }`, `summarize(rows: Row[]): string` (언어별 평균 일치도, 핵심포함률, 정답유일률, 실패 건수 마크다운 표). CLI: `npx tsx scripts/validate.ts --langs vi,ne,en` → `results/validation-{model}-{date}.md` 저장. 한 건 실패해도 `error`에 기록하고 계속

- [ ] **Step 1: 실패 테스트** (mock 모드)

```ts
test('runValidation produces one row per item×lang', async () => {
  const rows = await runValidation(items.slice(0, 2), ['vi', 'en']);
  expect(rows).toHaveLength(4);
});
test('summarize shows per-language averages', () => {
  expect(summarize(sampleRows)).toContain('| vi |');
});
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현 + `instructions.json` 30건 작성 (`npm i -D tsx`)
- [ ] **Step 4:** PASS 확인
- [ ] **Step 5:** 커밋 `feat: add validation script and dataset`
- [ ] **Step 6: 실제 API 실행 — 사용자 승인 후에만.** 콘솔 월 지출 한도 설정 확인 → `ANTHROPIC_API_KEY=... npx tsx scripts/validate.ts --langs vi,ne,en` → `results/` 파일 생성 확인. 사용자가 10건 직접 확인해서 결과 파일에 메모 추가
- [ ] **Step 7:** 커밋 `docs: add validation results`

---

### Task 9: 배포 + 제출 준비

**Files:**
- Create: `README.md`, `.env.example`

- [ ] **Step 1:** `README.md`: 서비스 소개, 실행 방법, 환경변수, **직접 구현 vs 외부 기술 구분**(LLM=Claude API, DB=Turso, QR=qrcode, 음성=Web Speech API), mock 모드 설명, 검증 결과 링크, 한계(원어민 검수 없음, 같은 모델이 판정)
- [ ] **Step 2:** `.env.example`: `ANTHROPIC_API_KEY=`, `DATABASE_URL=`, `TURSO_AUTH_TOKEN=`, `LLM_MOCK=0`, `LLM_HOURLY_CAP=100`, `LLM_MODEL=claude-haiku-5-5`
- [ ] **Step 3: 사용자 작업** — Turso DB 생성, Vercel 프로젝트 연결, 환경변수 입력(`LLM_MOCK=0`), Anthropic 콘솔 월 지출 한도 설정, GitHub Public 저장소 생성 후 push
- [ ] **Step 4:** 배포 URL을 실제 폰으로 열어 Task 7 Step 2 시나리오 재확인. **MockBadge 안 보이는지** 확인 (실제 API 동작)
- [ ] **Step 5:** 커밋 `docs: add readme and env example`, push. 제출용 main 커밋 해시 기록
