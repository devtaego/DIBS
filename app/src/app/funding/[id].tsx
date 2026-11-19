import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Cover, CtaBar, DNote, Ride } from '@/components/dibby';
import { Badge, Button, Card, ErrorBox, H1, H2, KV, Loading, MockBadge, Muted, Row, Screen, T } from '@/components/ui';
import { api, ApiError, track, type Breakeven, type FundingDetail, type Subscription } from '@/lib/api';
import { FUNDING_STATUS, SUB_STATUS, bps, dateText, won } from '@/lib/format';
import { colors, radii, space } from '@/lib/theme';
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Screen onRefresh={reload}>
      <Cover id={f.work_id} title={f.work_title} style={{ height: 180, borderRadius: radii.card, marginBottom: space(4) }} />
      <Row>
        <Badge label={FUNDING_STATUS[f.status]} tone="accent" />
        <Badge label={f.risk_grade} tone="danger" />
        <MockBadge mode={f.mode} />
        {f.days_left !== null ? <Badge label={`D-${f.days_left}`} /> : null}
      </Row>
      <H1>{f.work_title}</H1>

      <Card>
        <Row style={{ alignItems: 'baseline' }}>
          <T size={34} weight="700" color={colors.highlight}>{f.progress.achievement_pct.toLocaleString('ko-KR')}%</T>
          <Muted>달성</Muted>
        </Row>
        <Ride pct={f.progress.achievement_pct} />
        <KV k="모인 금액 (청약 기준)" v={won(f.progress.raised_amount)} />
        <KV k="목표" v={`${won(f.target_amount)} · ${f.target_units.toLocaleString('ko-KR')}조각`} />
        <KV k="참여자" v={`${f.progress.participants}명`} />
        <KV k="1조각" v={won(f.unit_price)} />
        <KV k="모집 마감" v={dateText(f.close_at)} />
        <KV k="1인 최대" v={`${f.per_user_cap_units.toLocaleString('ko-KR')}조각 (3,000만 원과 발행액 5% 중 작은 금액)`} />
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

      {isOpen && locked ? <Muted>마감 1시간 전이라 감액·취소는 할 수 없어요 (증액은 가능)</Muted> : null}

      <H2>목표를 넘으면 이렇게 나눠요</H2>
      <Card>
        <T>발행량의 <T weight="700" color={colors.accent}>{bps(t.allocation_params.equal_ratio_bps ?? 0)}</T>는 참여자 모두에게 고르게, 나머지는 청약 비율대로 배정해요.</T>
        {t.allocation_params.early_reader_bps ? (
          <T style={{ marginTop: space(1) }}>그중 <T weight="700" color={colors.accent}>{bps(t.allocation_params.early_reader_bps)}</T>는 모집 전에 이 작품을 찜한 초기 독자에게 먼저 나눠요.</T>
        ) : null}
        <Muted style={{ marginTop: space(1) }}>배정 못 받은 금액은 마감 직후 바로 돌려드려요.</Muted>
      </Card>

      <H2>손익분기 독자 규모</H2>
      <Card>
        {be.lines.map((l) => (
          <View key={l.goal} style={{ marginBottom: space(2) }}>
            <T weight="700">{l.goal}</T>
            <Muted>월 열람자 약 {l.monthly_readers.toLocaleString('ko-KR')}명 · 회차({be.price_coin}원)마다 {l.buyers_per_episode.toLocaleString('ko-KR')}명 결제 · 연 투자자 분배금(세후) {won(l.holder_dividend_per_year)}</Muted>
          </View>
        ))}
        <Muted size={12}>결제율 15%, 월 4화, 회수 전 투자자 몫 45%, 원천징수 15.4%를 가정한 값이에요. 수익을 보장하지 않아요.</Muted>
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
        <KV k="배당 · 원금 회수 전" v={`투자자 ${bps(t.royalty_holder_bps)} · 작가 ${bps(t.royalty_creator_bps)} · DIBS ${bps(t.royalty_platform_bps)}`} />
        <KV k="배당 · 원금 회수 후" v={`투자자 ${bps(t.royalty_holder_after_bps)} · 작가 ${bps(t.royalty_creator_after_bps)} · DIBS ${bps(t.royalty_platform_after_bps)}`} />
        <KV k="만기" v="없음 (완결 후 3년 또는 저매출 2분기 연속이면 종료)" />
        <KV k="작가 매입 옵션" v="최근 4분기 분배금 × 3으로 전량 매입" />
        <KV k="선공개 독점" v={`상장 후 ${t.exclusive_months}개월`} />
        <KV k="독점 종료 후" v={`외부 연재·영상화 수익(작가 몫)의 ${bps(t.external_share_bps)}를 순매출에 포함`} />
        <KV k="거래 수수료" v="0.015% (거래소·증권사 몫)" />
        <Muted style={{ marginTop: space(2) }}>{f.use_of_funds}</Muted>
      </Card>
      <DNote title="잠깐, 꼭 확인해 주세요" text="매우 높은 위험 상품이에요. 만기가 없고 원금은 상환되지 않아요. 분배금으로 원금을 회수하는 구조라 회수 기간이 길어질 수 있고, 원금 손실이 날 수 있으며 예금자 보호 대상이 아니에요." />
    </Screen>
    {isOpen ? (
      <CtaBar>
        <Button title={sub && sub.status === 'ACTIVE' ? '수량 바꾸기' : '조각 청약하기'} onPress={() => router.push(`/subscribe/${f.id}`)} style={{ flex: 1 }} />
      </CtaBar>
    ) : ['LISTED', 'SUSPENDED', 'TERMINATED'].includes(f.status) ? (
      <CtaBar>
        <Button title="조각 시세 보기" onPress={() => router.push(`/security/${f.id}`)} style={{ flex: 1 }} />
      </CtaBar>
    ) : null}
    </View>
  );
}
