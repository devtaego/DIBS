// 투자성향 5단계 (백엔드 /me/risk-profile 과 같은 점수 기준). 문항 5개 × 1~4점 = 5~20점.
export type RiskLevel = 'STABLE' | 'STABLE_SEEKING' | 'NEUTRAL' | 'ACTIVE' | 'AGGRESSIVE';

export const RISK_ORDER: RiskLevel[] = ['STABLE', 'STABLE_SEEKING', 'NEUTRAL', 'ACTIVE', 'AGGRESSIVE'];

export const RISK_INFO: Record<RiskLevel, { label: string; desc: string }> = {
  STABLE: { label: '안정형', desc: '원금을 지키는 것이 가장 중요해요. 예금·적금 수준의 위험을 선호해요.' },
  STABLE_SEEKING: { label: '안정추구형', desc: '손실은 작게, 수익은 예금보다 조금 더 원해요.' },
  NEUTRAL: { label: '위험중립형', desc: '어느 정도 손실을 감수하고 그만큼의 수익을 기대해요.' },
  ACTIVE: { label: '적극투자형', desc: '높은 수익을 위해 원금 손실 위험도 상당 부분 받아들여요.' },
  AGGRESSIVE: { label: '공격투자형', desc: '시장 평균을 크게 넘는 수익을 위해 큰 손실도 감수해요.' },
};

export function scoreToLevel(score: number): RiskLevel {
  if (score <= 7) return 'STABLE';
  if (score <= 10) return 'STABLE_SEEKING';
  if (score <= 13) return 'NEUTRAL';
  if (score <= 16) return 'ACTIVE';
  return 'AGGRESSIVE';
}

/** DIBS 조각은 '매우 높은 위험(1등급)' 상품 → 공격투자형만 성향에 맞고, 나머지는 부적합 확인 후 투자 */
export const PRODUCT_RISK = { grade: 1, label: '매우 높은 위험' };
export const fitsProduct = (level?: string | null) => level === 'AGGRESSIVE';
export const riskLabel = (level?: string | null) => (level && level in RISK_INFO ? RISK_INFO[level as RiskLevel].label : '투자성향 미확인');
