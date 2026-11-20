// 시연용 운영자 패널: 발표 중 폰에서 마감·상장·배당을 바로 실행한다. (운영자 계정 전용)
import { Alert, View } from 'react-native';
import { useState } from 'react';

import { Badge, Button, Card, ErrorBox, H2, Loading, Muted, Row, Screen, T } from '@/components/ui';
import { api, ApiError, type Episode, type FundingDetail } from '@/lib/api';
import { FUNDING_STATUS, won } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';
import { nowMs } from '@/lib/now';

type Payout = { seq: number; status: string; amount: number | null; milestone_note: string | null };
type CloseOut = { status: string; requested_units: number; target_units: number; allocations: { requested: number; allocated: number }[] };

const nowKst = () => new Date(nowMs() + 9 * 3600e3);
const quarter = () => {
  const d = nowKst();
  return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};

export default function AdminPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi(async () => {
    const list = await api.get<{ id: number }[]>('/admin/fundings');
    return Promise.all(list.map((f) => api.get<FundingDetail>(`/admin/fundings/${f.id}`)));
  });

  const run = async (key: string, label: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    try {
      const msg = await fn();
      Alert.alert(label, msg || '완료했어요');
      reload();
    } catch (e) {
      const err = e as ApiError;
      Alert.alert(`${label} 실패`, `${err.code}\n${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const approveAndOpen = (f: FundingDetail) =>
    run(`open${f.id}`, '승인·모집 시작', async () => {
      if (f.status === 'IN_REVIEW') await api.post(`/admin/fundings/${f.id}/review`, { approve: true, terms: {} });
      await api.post(`/admin/fundings/${f.id}/open`);
    });

  const close = (f: FundingDetail) =>
    run(`close${f.id}`, '마감·안분 배정', async () => {
      const r = await api.post<CloseOut>(`/admin/fundings/${f.id}/close`, {}, { force: true });
      if (r.status === 'FAILED') return `목표 미달(${r.requested_units}/${r.target_units})로 실패, 전액 해제했어요`;
      const zero = r.allocations.filter((a) => a.allocated === 0).length;
      return `${r.allocations.length}명에게 ${r.target_units}조각 배정 (청약 ${r.requested_units}조각, 0조각 ${zero}명)`;
    });

  const list = (f: FundingDetail) =>
    run(`list${f.id}`, '발행·상장', async () => {
      await api.post(`/admin/fundings/${f.id}/issuance`, { broker_name: '제휴증권(모의)' });
      const today = nowKst().toISOString().slice(0, 10);
      const steps: Record<string, unknown>[] = [
        { step: 'FILED' },
        { step: 'ISSUED', security_code: `KRDIBS${String(f.id).padStart(7, '0')}`, trustee: '모의신탁' },
        { step: 'LISTING_SCHEDULED', listing_date: today },
        { step: 'LISTED' },
      ];
      for (const s of steps) await api.post(`/admin/fundings/${f.id}/issuance/advance`, s);
      return '증권신고 → 발행 → 상장까지 끝났어요. 작가에게 40%가 지급됐어요';
    });

  const paidEpisode = (f: FundingDetail) =>
    run(`paid${f.id}`, '유료 미리보기 지정', async () => {
      const eps = await api.get<Episode[]>(`/works/${f.work_id}/episodes`);
      const last = eps[eps.length - 1];
      await api.patch(`/admin/episodes/${last.id}/pricing`, { is_paid: true, price_coin: 300 });
      return `${last.no}화를 300원 유료 미리보기로 지정했어요 (공개 21일 뒤 무료)`;
    });

  const dividend = (f: FundingDetail) =>
    run(`div${f.id}`, '이번 분기 배당', async () => {
      const period = quarter();
      await api.post(`/admin/fundings/${f.id}/revenues/aggregate`, { period });
      await api.post('/admin/revenues', { funding_id: f.id, period, source: 'AD', gross: 300_000, note: '시연용 광고 매출' });
      const r = await api.post<{ id: number; holder_pool: number; per_unit_gross: number; phase: string }>(`/admin/fundings/${f.id}/dividends`, { period }, { force: true });
      await api.post(`/admin/dividends/${r.id}/pay`, {}, { force: true });
      return `${period} 투자자 몫 ${won(r.holder_pool)} (주당 ${r.per_unit_gross}원, ${r.phase === 'AFTER_RECOUP' ? '회수 후 35%' : '회수 전 45%'})을 지급했어요`;
    });

  const milestone = (f: FundingDetail) =>
    run(`ms${f.id}`, '마일스톤 지급', async () => {
      const ps = await api.get<Payout[]>(`/admin/fundings/${f.id}/payouts`);
      const next = ps.find((p) => p.status === 'PENDING');
      if (!next) return '남은 지급이 없어요';
      await api.post(`/admin/fundings/${f.id}/payouts/${next.seq}/pay`);
      return `'${next.milestone_note}' 지급분 ${won(next.amount)}을 작가에게 보냈어요`;
    });

  const danger = (f: FundingDetail, kind: 'discontinue' | 'terminate') =>
    Alert.alert(kind === 'terminate' ? '권리를 종료할까요?' : '연재 중단을 확정할까요?', '되돌릴 수 없어요 (시연용)', [
      { text: '취소', style: 'cancel' },
      {
        text: '실행',
        style: 'destructive',
        onPress: () =>
          run(`${kind}${f.id}`, kind === 'terminate' ? '권리 종료' : '연재 중단', async () => {
            if (kind === 'terminate') {
              await api.post(`/admin/fundings/${f.id}/terminate`, {}, { force: true });
              return '수익 배분 권리를 종료했어요. 원금 상환은 없어요';
            }
            const r = await api.post<{ distributed: number; holders: number }>(`/admin/fundings/${f.id}/discontinue`, { reason: '시연: 연재 중단 확정' });
            return `남은 작가 지급분 ${won(r.distributed)}을 주주 ${r.holders}명에게 나눴어요`;
          }),
      },
    ]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload}>
      <Muted>발표 시연용이에요. 실제 운영에서는 웹 어드민과 스케줄러가 처리해요.</Muted>
      <ErrorBox error={error} onRetry={reload} />
      {data?.map((f) => (
        <Card key={f.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="700" style={{ flex: 1 }}>{f.work_title}</T>
            <Badge label={FUNDING_STATUS[f.status]} tone="accent" />
          </Row>
          <Muted>
            #{f.id} · 목표 {f.target_units}조각 · 청약 {f.progress.requested_units}조각 ({f.progress.achievement_pct}%)
          </Muted>
          <View style={{ gap: space(2), marginTop: space(3) }}>
            {['IN_REVIEW', 'APPROVED'].includes(f.status) ? <Button title="승인하고 모집 시작" onPress={() => approveAndOpen(f)} loading={busy === `open${f.id}`} /> : null}
            {f.status === 'OPEN' ? <Button title="지금 마감 → 안분 배정" onPress={() => close(f)} loading={busy === `close${f.id}`} /> : null}
            {f.status === 'ALLOCATED' ? <Button title="발행 4단계 → 상장" onPress={() => list(f)} loading={busy === `list${f.id}`} /> : null}
            {f.status === 'LISTED' ? (
              <>
                <Button title="마지막 회차 유료 지정 (500코인)" kind="ghost" onPress={() => paidEpisode(f)} loading={busy === `paid${f.id}`} />
                <Button title="이번 분기 배당 계산·지급" onPress={() => dividend(f)} loading={busy === `div${f.id}`} />
                <Button title="다음 마일스톤 작가 지급" kind="ghost" onPress={() => milestone(f)} loading={busy === `ms${f.id}`} />
                <Row style={{ gap: space(2) }}>
                  <Button title="연재 중단" kind="danger" style={{ flex: 1 }} onPress={() => danger(f, 'discontinue')} />
                  <Button title="권리 종료" kind="danger" style={{ flex: 1 }} onPress={() => danger(f, 'terminate')} />
                </Row>
              </>
            ) : null}
          </View>
        </Card>
      ))}

      <H2>배치 작업 (운영에서는 자동)</H2>
      <Button title="자정: 미체결 주문 취소" kind="ghost" onPress={() => run('exp', '미체결 주문 취소', async () => { const r = await api.post<{ affected: number }>('/admin/jobs/expire-orders'); return `${r.affected}건 취소`; })} />
      <Button title="04:00: 기준가 갱신" kind="ghost" style={{ marginTop: space(2) }} onPress={() => run('roll', '기준가 갱신', async () => { const r = await api.post<{ affected: number }>('/admin/jobs/roll-reference-prices'); return `${r.affected}개 종목`; })} />
      <Button
        title="시산표 확인 (합계 0이면 정상)"
        kind="ghost"
        style={{ marginTop: space(2) }}
        onPress={() =>
          run('tb', '시산표', async () => {
            const lines = await api.get<{ mode: string; balance: number }[]>('/admin/ledger/trial-balance');
            const sum = (m: string) => lines.filter((l) => l.mode === m).reduce((a, l) => a + l.balance, 0);
            return `모의 합계 ${sum('MOCK')}원 · 실거래 합계 ${sum('LIVE')}원`;
          })
        }
      />
      <T size={12} color={colors.faint} style={{ marginTop: space(4) }}>분기는 오늘 날짜 기준({quarter()})으로 계산해요.</T>
    </Screen>
  );
}
