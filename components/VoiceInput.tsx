'use client';

import { useRef, useState, useSyncExternalStore } from 'react';

type Recognition = {
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

const ctor = () => {
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const noop = () => () => {};

export default function VoiceInput({ onText }: { onText: (text: string) => void }) {
  const supported = useSyncExternalStore(noop, () => !!ctor(), () => false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  if (!supported) return null;

  const toggle = () => {
    if (listening) return rec.current?.stop();
    const Ctor = ctor()!;
    const r = new Ctor();
    r.lang = 'ko-KR';
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <button type="button" className={`btn mic${listening ? ' on' : ''}`} onClick={toggle} aria-label="음성으로 입력">
      🎤 {listening ? '듣는 중...' : '말로 입력'}
    </button>
  );
}
