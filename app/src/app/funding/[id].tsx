import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, ErrorBox, H1, H2, KV, Loading, MockBadge, Muted, ProgressBar, Row, Screen, T } from '@/components/ui';
import { api, ApiError, track, type Breakeven, type FundingDetail, type Subscription } from '@/lib/api';
import { FUNDING_STATUS, SUB_STATUS, bps, dateText, won } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function FundingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(
    async () => {
      const [f, be] = await Promise.all([api.get<FundingDetail>(`/fundings/${id}`), api.get<Breakeven>(`/fundings/${id}/breakeven`)]);
      let sub: Subscription | null = null;
      try {
        sub = await api.get<Subscription>(`/fundings/${id}/subscriptions/me`);
      } catch (e) {
        if ((e as ApiError).status !== 404) throw e;
      }
      return { f, be, sub };
    },
    [id],
    30_000, // 모집 중 달성률 30초마다 갱신
  );

  useEffect(() => {
    track('FUNDING_VIEW', { funding_id: Number(id) });
  }, [id]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  const { f, be, sub } = data;
  const t = f.terms;
  const isOpen = f.status === 'OPEN';
  const locked = f.lock_at ? new Date(f.lock_at) <= new Date(Date.now() + 9 * 3600e3) : false;

  return (
    <Screen onRefresh={reload}>
      <Row>
        <Badge label={FUNDING_STATUS[f.status]} tone="accent" />
        <MockBadge mode={f.mode} />
        {f.days_left !== null ? <Badge label={`D-${f.days_left}`} /> : null}
      </Row>
      <H1>{f.work_title}</H1>

      <Card>
        <Row style={{ alignItems: 'baseline' }}>
          <T size={34} weight="700" color={colors.accent}>{f.progress.achievement_pct.toLocaleString('ko-KR')}%</T>
          <Muted>달성</Muted>
        </Row>
        <ProgressBar pct={f.progress.achievement_pct} />
        <KV k="모인 금액 (청약 기준)" v={won(f.progress.raised_amount)} />
        <KV k="목표" v={`${won(f.target_amount)} · ${f.target_units.toLocaleString('ko-KR')}조각`} />
        <KV k="참여자" v={`${f.progress.participants}명`} />
        <KV k="1조각" v={won(f.unit_price)} />
        <KV k="모집 마감" v={dateText(f.close_at)} />
        {f.max_units_per_user ? <KV k="1인 최대" v={`${f.max_units_per_user}조각`} /> : null}
      </Card>

      {sub ? (
        <Card style={{ borderWidth: 1, borderColor: colors.accent }}>
          <T weight="700">내 청약 · {SUB_STATUS[sub.status]}</T>
          {sub.allocated_units !== null ? (
            <T size={18} weight="700" color={colors.accent} style={{ marginTop: space(1) }}>신청 {sub.units}조각 → {sub.allocated_units}조각 배정</T>
          ) : (
            <Muted>{sub.units}조각 청약 · 마감 후 배정돼요</Muted>
          )}
        </Card>
      ) : null}

      {isOpen ? (
        <Button
          title={sub && sub.status === 'ACTIVE' ? '수량 바꾸기' : '조각 청약하기'}
          onPress={() => router.push(`/subscribe/${f.id}`)}
          style={{ marginBottom: space(2) }}
        />
      ) : null}
      {isOpen && locked ? <Muted>마감 1시간 전이라 감액·취소는 할 수 없어요 (증액은 가능)</Muted> : null}
      {['LISTED', 'SUSPENDED', 'MATURED'].includes(f.status) ? <Button title="조각 마켓에서 보기" onPress={() => router.push(`/security/${f.id}`)} /> : null}

      <H2>목표를 넘으면 이렇게 나눠요</H2>
      <Card>
        <T>목표의 <T weight="700" color={colors.accent}>{bps(t.allocation_params.equal_ratio_bps ?? 0)}</T>는 참여자 모두에게 고르게, 나머지는 청약 비율대로 배정해요.</T>
        <Muted style={{ marginTop: space(1) }}>배정 못 받은 금액은 마감 직후 바로 돌려드려요.</Muted>
      </Card>

      <H2>손익분기 독자 규모</H2>
      <Card>
        {be.lines.map((l) => (
          <View key={l.goal} style={{ marginBottom: space(2) }}>
            <T weight="700">{l.goal}</T>
            <Muted>회차({be.price_coin}코인)마다 약 {l.buyers_per_episode.toLocaleString('ko-KR')}명이 유료로 봐야 해요 · 연 주주 배당 {won(l.holder_dividend_per_year)}</Muted>
          </View>
        ))}
        <Muted size={12}>1년차 DIBS 안 유료 회차 매출만으로 계산한 보수적인 수치예요.</Muted>
      </Card>

      {f.reward_tiers.length ? <H2>리워드 (선택)</H2> : null}
      {f.reward_tiers.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="700" style={{ flex: 1 }}>{r.title}</T>
            <Badge label={`${r.min_units}조각 이상`} />
          </Row>
          {r.limited_qty ? <Muted>한정 {r.limited_qty}개{r.requires_shipping ? ' · 배송' : ''}</Muted> : null}
        </Card>
      ))}

      <H2>투자 조건</H2>
      <Card>
        <KV k="모금액 배분" v={`작가 ${bps(t.creator_bps)} · 발행 ${bps(t.issuance_cost_bps)} · DIBS ${bps(t.platform_fee_bps)}`} />
        <KV k="작가 지급" v="상장 40% · 10화 30% · 20화 30%" />
        <KV k="배당 (순매출)" v={`주주 ${bps(t.royalty_holder_bps)} · 작가 ${bps(t.royalty_creator_bps)} · DIBS ${bps(t.royalty_platform_bps)}`} />
        <KV k="운용 기간" v={`${t.operating_period_months / 12}년`} />
        <KV k="선공개 독점" v={`상장 후 ${t.exclusive_months}개월`} />
        <KV k="외부 진출 후" v={`외부 연재 수익의 ${bps(t.external_share_bps)} 주주 배당`} />
        <Muted style={{ marginTop: space(2) }}>{f.use_of_funds}</Muted>
      </Card>
      <Muted style={{ marginTop: space(2) }}>만기에는 마지막 배당 후 상장폐지되고 원금은 상환되지 않아요. 원금 손실이 날 수 있고 예금자 보호 대상이 아니에요.</Muted>
    </Screen>
  );
}
