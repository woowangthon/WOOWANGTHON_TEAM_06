'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import VoiceInput from '@/components/VoiceInput';

const MAX = 500;

export default function Home() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const append = useCallback((t: string) => setText((prev) => (prev ? `${prev} ${t}` : t).slice(0, MAX)), []);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '요청에 실패했습니다');
      router.push(`/s/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>작업지시 이해확인</h1>
      <p className="sub">오늘의 작업지시를 입력하면 근로자가 자기 나라 말로 배우고 퀴즈로 이해했는지 확인합니다.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예) 오늘 3층 비계 작업은 안전고리를 반드시 체결하고 올라갑니다."
        rows={7}
        aria-label="작업지시"
      />
      <div className="row between">
        <span className={text.length > MAX ? 'count over' : 'count'}>
          {text.length} / {MAX}
        </span>
        <VoiceInput onText={append} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary big" onClick={submit} disabled={busy || !text.trim()}>
        {busy ? '만드는 중...' : '교육 시작'}
      </button>
    </main>
  );
}
