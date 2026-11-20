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

/** 연속 접속 일수: 앱을 연 날짜를 기기에 남기고, 오늘까지 이어진 날 수를 센다 */
export function useVisitStreak(todayMs: number): number {
  const day = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  const today = day(todayMs);
  const [days, setDays] = useState<string[]>([today]);
  useEffect(() => {
    store.get('dibs.visits').then((raw) => {
      let past: string[] = [];
      try { past = raw ? (JSON.parse(raw) as string[]) : []; } catch { /* 무시 */ }
      const next = past.includes(today) ? past : [...past.slice(-60), today];
      if (next !== past) store.set('dibs.visits', JSON.stringify(next));
      setDays(next);
    });
  }, [today]);
  const set = new Set([...days, today]);
  let n = 0;
  for (let t = todayMs; set.has(day(t)); t -= 86_400_000) n++;
  return Math.max(1, n);
}

/** 시연 초기화 때 화면에 남은 설정 값도 비운다 */
export function clearPrefMemory() {
  for (const k of Object.keys(mem)) delete mem[k];
  subs.forEach((g) => g());
}
