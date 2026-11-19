import { router } from 'expo-router';

import type { Pose } from '@/components/dibby';

/** 완료 화면(/done)으로 교체 이동 */
export function showDone(p: {
  pose: Pose;
  tag: string;
  title: string;
  sub: string;
  rows: [string, string][];
  note?: string;
  aLabel: string;
  aHref: string;
  bLabel?: string;
  bHref?: string;
}) {
  router.replace({ pathname: '/done', params: { ...p, rows: JSON.stringify(p.rows) } });
}
