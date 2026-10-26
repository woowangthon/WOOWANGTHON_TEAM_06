'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANGS, LANG_LABELS, LANG_NATIVE, type Lang } from '@/lib/types';

export default function Join({ params }: PageProps<'/j/[id]'>) {
  const { id } = use(params);
  const router = useRouter();
  const [name, setName] = useState('');
  const [lang, setLang] = useState<Lang>('vi');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/sessions/${id}/workers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '요청에 실패했습니다 / Request failed');
      router.push(`/w/${data.workerId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="page worker-page">
      <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label className="field">
          이름 / Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="off" required />
        </label>
        <label className="field">
          언어 / Language
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {`${LANG_NATIVE[l]} (${LANG_LABELS[l]})`}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big" disabled={busy || !name.trim()}>
          시작 / Start
        </button>
      </form>
    </main>
  );
}
