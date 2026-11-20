// 서류함: 청약·투자 관련 서류를 한곳에서. 시연에서는 서류 요약을 펼쳐 보여 준다.
import { router } from 'expo-router';
import { View } from 'react-native';

import { Fold, MePage } from '@/components/MePage';
import { ErrorBox } from '@/components/ui';
import { Button, Empty, GroupLabel, KV, Txt, color } from '@/ds';
import { api, type MySubscription } from '@/lib/api';
import { RISK_INFO, type RiskLevel } from '@/lib/risk';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

const day = (s?: string | null) => (s ? s.slice(0, 10).replaceAll('-', '.') : '—');
const STATUS: Record<string, string> = { ACTIVE: '청약 중', ALLOCATED: '배정 완료', REFUNDED: '환불', CANCELLED: '취소' };

export default function Docs() {
  const { me } = useSession();
  const { data: subs, error, reload } = useApi(() => api.get<MySubscription[]>('/me/subscriptions'));
  const list = subs ?? [];
  return (
    <MePage title="서류함" onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      <View>
        <GroupLabel>청약</GroupLabel>
        {subs && !list.length ? <Empty title="아직 청약한 펀딩이 없어요" /> : null}
        {list.map((s) => (
          <View key={s.id}>
            <Fold icon="cDoc" title={`청약 확인서 · ${s.work_title}`} sub={`${day((s as { first_subscribed_at?: string }).first_subscribed_at)} · ${STATUS[s.status] ?? s.status}`}>
              <KV k="신청" v={`${s.units}조각 · ${(s.units * s.unit_price).toLocaleString('ko-KR')}원`} />
              <KV k="배정" v={s.allocated_units != null ? `${s.allocated_units}조각` : '마감 후 확정'} />
              <KV k="조각 가격" v={`${s.unit_price.toLocaleString('ko-KR')}원`} />
            </Fold>
            <Fold icon="doc" title={`투자설명서 · ${s.work_title}`} sub="상품 구조 · 위험 · 권리 종료 조건">
              <Txt v="body2" c={color.labelNeutral}>작품 수익에 대한 권리를 조각으로 나눈 상품이에요. 원금 손실이 날 수 있고 예금자 보호 대상이 아니에요. 완결 후 정해진 기간이 지나거나 수익이 계속 낮으면 권리가 끝나고, 만기 후 권리는 작가에게 돌아가요.</Txt>
              <Button label="펀딩 페이지에서 전체 보기" size="Small" variant="Outlined" tone="Assistive" fill={false} onPress={() => router.push(`/funding/${s.funding_id}`)} />
            </Fold>
          </View>
        ))}
      </View>
      <View>
        <GroupLabel>확인서 · 리포트</GroupLabel>
        <Fold icon="cShield" title="투자성향 확인서" sub={me?.risk_checked_at ? `${day(me.risk_checked_at)} 확인` : '아직 확인하지 않았어요'}>
          <KV k="결과" v={me?.risk_level ? RISK_INFO[me.risk_level as RiskLevel]?.label ?? me.risk_level : '미확인'} />
          <Button label="투자성향 확인하기" size="Small" variant="Outlined" tone="Assistive" fill={false} onPress={() => router.push('/risk-profile')} />
        </Fold>
        <Fold icon="chart" title="분기 정산 리포트" sub="보유 조각의 분기별 수익 정산" last>
          <Button label="정산 리포트 열기" size="Small" variant="Outlined" tone="Assistive" fill={false} onPress={() => router.push('/dividends')} />
        </Fold>
      </View>
    </MePage>
  );
}
