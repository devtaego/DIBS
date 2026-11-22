// 투자 한도: 투자자 유형별 연간 한도와 남은 금액. (수치는 시연용 정책 값)
import { View } from 'react-native';

import { MePage } from '@/components/MePage';
import { ErrorBox } from '@/components/ui';
import { Callout, KV, LinearProgress, Panel, Txt, color, spacing } from '@/ds';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Limits = { mode: string; annual_limit: number | null; annual_remaining: number | null; security_limit: number | null; security_remaining: number | null };
/** 억·만 단위로 읽기 쉽게: 98,682,250 → '9,868만 2,250원', 100,000,000 → '1억 원' */
const won = (n: number) => {
  const v = Math.round(n);
  const eok = Math.floor(v / 1e8), man = Math.floor((v % 1e8) / 1e4), rest = v % 1e4;
  const parts = [eok ? `${eok.toLocaleString('ko-KR')}억` : '', man ? `${man.toLocaleString('ko-KR')}만` : ''].filter(Boolean);
  if (rest || !parts.length) return [...parts, `${rest.toLocaleString('ko-KR')}원`].join(' ');
  return `${parts.join(' ')} 원`;
};
const TYPE: Record<string, string> = { GENERAL: '일반 투자자', QUALIFIED: '소득 적격 투자자', PROFESSIONAL: '전문 투자자' };

export default function Limits() {
  const { me } = useSession();
  const { data, error, reload } = useApi(() => api.get<Limits>('/me/limits'));
  const total = data?.annual_limit ?? 0;
  const left = data?.annual_remaining ?? 0;
  const used = Math.max(0, total - left);
  return (
    <MePage title="투자 한도" onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      <View style={{ gap: spacing.gapXs }}>
        <Txt v="label1" c={color.labelAlternative}>{`${TYPE[(me as { investor_type?: string } | null)?.investor_type ?? 'GENERAL'] ?? '일반 투자자'} · 올해 남은 한도`}</Txt>
        <Txt v="title1" w="bold" c={color.labelStrong} tabular>{data ? won(left) : '—'}</Txt>
      </View>
      {total ? (
        <Panel>
          <LinearProgress value={Math.round((used / total) * 100)} />
          <KV k="연간 한도" v={won(total)} />
          <KV k="올해 투자한 금액" v={won(used)} strong />
          <KV k="종목당 한도" v={data?.security_limit ? won(data.security_limit) : '별도 없음'} />
        </Panel>
      ) : null}
      <Callout title="한도는 이렇게 계산돼요">
        청약 신청 금액과 조각 매수 금액을 합쳐서 계산해요. 청약이 일부만 배정되면 환불된 만큼 한도가 돌아와요. 한도는 투자자 유형과 관련 법령에 따라 달라질 수 있어요.
      </Callout>
    </MePage>
  );
}
