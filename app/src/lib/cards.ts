import type { WorkCardData, WorkStatus } from '@/ds';
import type { FundingCard, SecurityItem, WorkCard } from '@/lib/api';

export const manwon = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export const typeLabel = (t?: string | null) => (t === 'NOVEL' || t === 'WEBNOVEL' ? '웹소설' : '웹툰');

export function fundingStatus(status?: string | null): WorkStatus {
  if (status === 'LISTED' || status === 'SUSPENDED') return '거래 중';
  if (status === 'OPEN' || status === 'APPROVED') return '모집 중';
  if (!status) return '연재 중'; // 펀딩을 연 적 없는 작품
  return '모집 후';
}

export function ddayText(f: Pick<FundingCard, 'days_left' | 'status'>) {
  if (f.status === 'LISTED') return '상장';
  if (f.days_left == null) return '';
  return f.days_left <= 0 ? '오늘 마감' : `D-${f.days_left}`;
}

/** 펀딩 카드 → Work Card 데이터 (작품 정보가 있으면 장르·형식·찜 수를 채운다) */
export function fundingToCard(f: FundingCard, w?: WorkCard): WorkCardData {
  return {
    id: f.work_id,
    title: f.work_title,
    genre: w?.genre,
    format: typeLabel(w?.type),
    likes: w?.dib_count,
    pct: Math.round(f.progress.achievement_pct),
    raised: manwon(f.progress.raised_amount),
    goal: manwon(f.target_amount),
    dday: ddayText(f),
    status: fundingStatus(f.status),
    coverUrl: w?.cover_url,
  };
}

export function trendOf(n: number | null | undefined): 'Rise' | 'Fall' | 'Flat' {
  if (!n) return 'Flat';
  return n > 0 ? 'Rise' : 'Fall';
}

export const signedPct = (n: number | null | undefined, d = 1) => (n == null ? '0.0%' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}%`);

/** 조각 마켓 지수: 상장 종목 (현재가 ÷ 공모가)의 평균 × 1,000 */
export function marketIndex(list: SecurityItem[]) {
  if (!list.length) return { value: 1000, change: 0 };
  const now = list.reduce((a, x) => a + (x.last_price ?? x.unit_price) / x.unit_price, 0) / list.length;
  const ref = list.reduce((a, x) => a + (x.reference_price ?? x.unit_price) / x.unit_price, 0) / list.length;
  return { value: now * 1000, change: (now - ref) * 1000, changePct: ref ? ((now - ref) / ref) * 100 : 0 };
}
