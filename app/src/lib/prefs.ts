// 기기에 저장하는 작은 설정 (알림 설정, 키움 모의 계좌 연결). 화면 사이에서 같은 값을 보도록 모듈 상태로 둔다.
import { useEffect, useState } from 'react';

import { store } from './api';

const mem: Record<string, unknown> = {};
const subs = new Set<() => void>();

export function usePref<T>(key: string, init: T): [T, (v: T) => void] {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!(key in mem)) store.get(`dibs.${key}`).then((raw) => { if (raw != null && !(key in mem)) { try { mem[key] = JSON.parse(raw); } catch { /* 무시 */ } subs.forEach((g) => g()); } });
    return () => { subs.delete(f); };
  }, [key]);
  const set = (v: T) => { mem[key] = v; store.set(`dibs.${key}`, JSON.stringify(v)); subs.forEach((g) => g()); };
  return [(key in mem ? mem[key] : init) as T, set];
}

export type KiwoomLink = { linked: boolean; account?: string; at?: string };
export const useKiwoomLink = () => usePref<KiwoomLink>('kiwoom', { linked: false });
