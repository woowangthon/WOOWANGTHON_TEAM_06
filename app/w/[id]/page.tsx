'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import MockBadge from '@/components/MockBadge';
import type { Lesson, Worker } from '@/lib/types';

const NOTICE = 'Please try again shortly / 잠시 후 다시 시도해 주세요';

export default function WorkerPage({ params }: PageProps<'/w/[id]'>) {
  const { id } = use(params);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [mock, setMock] = useState(false);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState(false);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [busy, setBusy] = useState(false);
  const latest = useRef(-1);
  const shown = useRef(-1);

  const loadLesson = useCallback(
    async (level: number) => {
      latest.current = Math.max(latest.current, level);
      try {
        const res = await fetch(`/api/workers/${id}/lesson`, { cache: 'no-store' });
        if (!res.ok) return setNotice(true);
        const data = await res.json();
        if (data.level < latest.current) return;
        shown.current = data.level;
        setLesson(data.lesson);
        setMock(data.mock);
        setAnswers([]);
        setNotice(false);
      } catch {
        setNotice(true);
      }
    },
    [id],
  );

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch(`/api/workers/${id}`, { cache: 'no-store' });
      if (res.status === 404) return setMissing(true);
      if (!res.ok) return setNotice(true);
      const w: Worker = await res.json();
      setWorker(w);
      await loadLesson(w.level);
    } catch {
      setNotice(true);
    }
  }, [id, loadLesson]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; setState happens after await
    loadAll();
  }, [loadAll]);

  const waiting = worker?.status === 'failed';
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/workers/${id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const w: Worker = await res.json();
        setWorker(w);
        if (w.level !== shown.current) loadLesson(w.level);
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [waiting, id, loadLesson]);

  const submit = async () => {
    if (!lesson) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workers/${id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: shown.current, answers }),
      });
      if (res.status === 409) await loadAll();
      else if (!res.ok) setNotice(true);
      else {
        const { passed } = await res.json();
        setWorker((w) => w && { ...w, status: passed ? 'passed' : 'failed' });
      }
    } catch {
      setNotice(true);
    }
    setBusy(false);
  };

  if (missing) return <main className="page"><p className="error">Not found / 찾을 수 없습니다.</p></main>;

  if (notice)
    return (
      <main className="page worker-page">
        <p className="result">{NOTICE}</p>
        <button className="btn primary big" onClick={() => { setNotice(false); loadAll(); }}>
          Retry / 다시 시도
        </button>
      </main>
    );

  if (!worker || !lesson) return <main className="page worker-page"><p className="sub">설명을 준비하고 있어요 / Preparing…</p></main>;

  const { ui } = lesson;
  const done = worker.status === 'passed' || worker.status === 'approved';

  return (
    <main className="page worker-page" lang={worker.lang}>
      <MockBadge show={mock} />
      {done ? (
        <p className="card result"><span className="emoji">✅</span>{worker.status === 'approved' ? '투입 확인됨 / Approved by supervisor' : ui.passed}</p>
      ) : (
        <>
          {worker.status === 'failed' ? (
            <p className="card result"><span className="emoji">🔄</span>{ui.failed}<br />{ui.waiting}</p>
          ) : null}
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {lesson.steps.map((s, i) => (
              <div className="step" key={i}>
                <span className="emoji">{s.emoji}</span>
                <p>{s.text}</p>
              </div>
            ))}
          </section>
          {worker.status === 'pending' && (
            <>
              {lesson.quiz.map((q, qi) => (
                <section className="card" key={qi}>
                  <p className="question">{q.question}</p>
                  <div className="options">
                    {q.options.map((o, oi) => (
                      <button
                        key={oi}
                        className={`opt${answers[qi] === oi ? ' sel' : ''}`}
                        aria-pressed={answers[qi] === oi}
                        onClick={() => setAnswers((a) => { const n = [...a]; n[qi] = oi; return n; })}
                      >
                        <span className="emoji">{o.emoji}</span>
                        <span>{o.text}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              <button
                className="btn primary big"
                disabled={busy || lesson.quiz.some((_, qi) => answers[qi] === undefined)}
                onClick={submit}
              >
                {ui.submit}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}
