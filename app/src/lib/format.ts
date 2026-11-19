export const won = (n: number | null | undefined) =>
  n === null || n === undefined ? '-' : `${Math.round(n).toLocaleString('ko-KR')}원`;

export const num = (n: number | null | undefined) =>
  n === null || n === undefined ? '-' : Math.round(n).toLocaleString('ko-KR');

export const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? '-' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;

export const bps = (n: number) => `${n / 100}%`;

export const dateText = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-');
  return t ? `${y}.${m}.${day} ${t.slice(0, 5)}` : `${y}.${m}.${day}`;
};

export const FUNDING_STATUS: Record<string, string> = {
  IN_REVIEW: '심사 중',
  APPROVED: '모집 예정',
  OPEN: '펀딩 중',
  FAILED: '펀딩 실패',
  ALLOCATED: '배정 완료',
  ISSUING: '발행 중',
  ISSUE_FAILED: '발행 무산',
  LISTED: '상장',
  SUSPENDED: '거래 정지',
  MATURED: '운용 종료',
};

export const SUB_STATUS: Record<string, string> = {
  ACTIVE: '청약 중',
  CANCELLED: '취소',
  ALLOCATED: '배정 완료',
  REFUNDED: '환불 완료',
};

export const ORDER_STATUS: Record<string, string> = {
  OPEN: '대기',
  PARTIAL: '일부 체결',
  FILLED: '체결',
  CANCELLED: '취소',
  EXPIRED: '자정 취소',
};
