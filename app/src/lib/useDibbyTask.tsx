import { useRef, useState } from 'react';

import { DibbyLoading } from '@/components/dibby';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 결제·청약·주문처럼 기다리는 순간에 디비 로딩 화면을 띄운다.
 * 서버가 빨리 끝나도 단계 문구가 읽히도록 최소 minMs 동안 보여준다.
 */
export function useDibbyTask() {
  const [st, setSt] = useState({ visible: false, title: '', step: '', pct: 0 });
  const busy = useRef(false);

  async function run<T>(title: string, steps: string[], fn: () => Promise<T>, minMs = 1800): Promise<T> {
    if (busy.current) throw new Error('BUSY');
    busy.current = true;
    const t0 = Date.now();
    setSt({ visible: true, title, step: steps[0], pct: 4 });
    const timer = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / minMs);
      setSt((p) => ({ ...p, pct: Math.max(p.pct, 4 + k * 86), step: steps[Math.min(steps.length - 1, Math.floor(k * steps.length))] }));
    }, 90);
    try {
      const r = await fn();
      const left = minMs - (Date.now() - t0);
      if (left > 0) await sleep(left);
      clearInterval(timer);
      setSt((p) => ({ ...p, pct: 100, step: steps[steps.length - 1] }));
      await sleep(380);
      return r;
    } finally {
      clearInterval(timer);
      setSt((p) => ({ ...p, visible: false }));
      busy.current = false;
    }
  }

  return { run, overlay: <DibbyLoading visible={st.visible} title={st.title} step={st.step} pct={st.pct} /> };
}
