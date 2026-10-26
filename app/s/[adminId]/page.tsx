'use client';

import { use, useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import MockBadge from '@/components/MockBadge';
import { LANG_LABELS, type Worker, type WorkerStatus } from '@/lib/types';

type SessionData = { id: string; instructionKo: string; workers: Worker[]; mock: boolean };

const STATUS: Record<WorkerStatus, { icon: string; label: string }> = {
  pending: { icon: '⚪', label: '대기' },
  failed: { icon: '🔴', label: '재설명 필요' },
  passed: { icon: '🟢', label: '이해함' },
  approved: { icon: '✅', label: '투입' },
};

export default function Dashboard({ params }: PageProps<'/s/[adminId]'>) {
  const { adminId } = use(params);
  const [data, setData] = useState<SessionData | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/admin/${adminId}`, { cache: 'no-store' });
      if (res.status === 404) return setMissing(true);
      if (res.ok) setData(await res.json());
    } catch {}
  }, [adminId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; setState happens after await
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const sessionId = data?.id;
  useEffect(() => {
    if (!sessionId) return;
    const url = `${window.location.origin}/j/${sessionId}`;
    QRCode.toDataURL(url, { margin: 1, width: 240 })
      .catch(() => '')
      .then((dataUrl) => {
        setJoinUrl(url);
        setQr(dataUrl);
      });
  }, [sessionId]);

  const act = async (workerId: string, action: 'retry' | 'approve') => {
    setError('');
    try {
      const res = await fetch(`/api/workers/${workerId}/${action}?key=${adminId}`, { method: 'POST' });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? '요청에 실패했습니다');
    } catch {
      setError('요청에 실패했습니다');
    }
    load();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (missing) return <main className="page"><p className="error">교육을 찾을 수 없습니다.</p></main>;
  if (!data) return <main className="page"><p className="sub">불러오는 중...</p></main>;

  return (
    <main className="page wide">
      <MockBadge show={data.mock} />
      <section className="card">
        <h2>오늘의 작업지시</h2>
        <p className="instruction">{data.instructionKo}</p>
      </section>

      <section className="card join">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
        {qr && <img src={qr} width={200} height={200} alt="근로자 참여 QR 코드" />}
        <div>
          <h2>근로자 참여</h2>
          <p className="sub">휴대폰으로 QR을 찍으면 자기 나라 말로 교육이 시작됩니다.</p>
          <div className="row">
            <code className="url">{joinUrl}</code>
            <button className="btn" onClick={copy}>{copied ? '복사됨' : '복사'}</button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>근로자 ({data.workers.length}명)</h2>
        {error && <p className="error" role="alert">{error}</p>}
        {data.workers.length === 0 ? (
          <p className="sub">아직 참여한 근로자가 없습니다.</p>
        ) : (
          <ul className="workers">
            {data.workers.map((w) => (
              <li key={w.id} className={`worker ${w.status}`}>
                <div className="who">
                  <strong>{w.name}</strong>
                  <span className="sub">{LANG_LABELS[w.lang]}</span>
                </div>
                <div className="state">
                  <span>{STATUS[w.status].icon}</span>
                  {STATUS[w.status].label}
                  {w.level > 0 && <span className="level"> · 재설명 {w.level}회</span>}
                </div>
                <div className="actions">
                  {w.status === 'failed' && (
                    <>
                      <button className="btn primary" onClick={() => act(w.id, 'retry')}>다시 설명</button>
                      <button className="btn" onClick={() => act(w.id, 'approve')}>그래도 투입</button>
                    </>
                  )}
                  {w.status === 'passed' && (
                    <button className="btn primary" onClick={() => act(w.id, 'approve')}>투입</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
