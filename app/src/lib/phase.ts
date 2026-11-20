// 작품의 공모 단계: 공모 전(펀딩 없음·심사·승인 대기) / 공모 중 / 공모 종료(배정·발행·상장 이후)
export type Phase = 'PRE' | 'OPEN' | 'CLOSED';
const PRE = new Set(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED']);
export const phaseOf = (status?: string | null): Phase => (status === 'OPEN' ? 'OPEN' : !status || PRE.has(status) ? 'PRE' : 'CLOSED');
export const PHASE_LABEL: Record<Phase, string> = { PRE: '공모 전', OPEN: '공모 중', CLOSED: '공모 종료' };
