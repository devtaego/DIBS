import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Cover, CtaBar, DNote, Ride } from '@/components/dibby';
import { Badge, Button, Card, ErrorBox, H1, H2, KV, Loading, MockBadge, Muted, Row, Screen, T } from '@/components/ui';
import { api, ApiError, track, type Breakeven, type Disclosure, type FundingDetail, type Indicators, type Subscription } from '@/lib/api';
import { FUNDING_STATUS, SUB_STATUS, bps, dateText, won } from '@/lib/format';
import { colors, radii, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function FundingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(
    async () => {
      const [f, be, ind, disc] = await Promise.all([
        api.get<FundingDetail>(`/fundings/${id}`),
        api.get<Breakeven>(`/fundings/${id}/breakeven`),
        api.get<Indicators>(`/fundings/${id}/indicators`),
        api.get<Disclosure>(`/fundings/${id}/disclosure`),
      ]);
      let sub: Subscription | null = null;
      try {
        sub = await api.get<Subscription>(`/fundings/${id}/subscriptions/me`);
      } catch (e) {
        if ((e as ApiError).status !== 404) throw e;
      }
      return { f, be, sub, ind, disc };
    },
    [id],
    30_000, // 모집 중 달성률 30초마다 갱신
  );

  useEffect(() => {
    track('FUNDING_VIEW', { funding_id: Number(id) });
  }, [id]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  const { f, be, sub, ind, disc } = data;
  const mult = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)}배`);
  const mon = (v: number | null) => (v === null ? '기간 안 회수 못 함' : `${v}개월에 회수`);
  const SCEN: [keyof Indicators['scenarios'], string][] = [
    ['downside', '유료 팬 40%'], ['conservative', '유료 팬 70%'], ['base', '파일럿 그대로'], ['optimistic', '1.5배'],
  ];
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
        <KV k="1인 최대" v={`${f.per_user_cap_units.toLocaleString('ko-KR')}조각 · ${won(ind.per_user_cap_amount)} (3,000만 원과 발행액 5% 중 작은 금액)`} />
        <KV k="상품 기간" v={`시즌 연재 ${ind.season_months}개월 + 완결 후 ${ind.tail_months}개월`} />
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

      <H2>투자 지표</H2>
      <Card>
        <KV k="찜" v={`${ind.dibs_total.toLocaleString('ko-KR')}명 · 최근 7일 ${ind.dibs_7d.toLocaleString('ko-KR')}명`} />
        <KV k="파일럿 4주 열람자" v={`${ind.pilot_readers_4w.toLocaleString('ko-KR')}명`} />
        <KV k="파일럿 연독률 (1→3화)" v={ind.pilot_read_through === null ? '-' : `${Math.round(ind.pilot_read_through * 100)}%`} />
        <KV k="파일럿 4주 유료 팬" v={`${ind.pilot_paying_fans_4w.toLocaleString('ko-KR')}명 (유료 미리보기 구매자)`} />
        <KV
          k="발행 조건 (필요 유료 팬)"
          v={`${ind.gate_threshold.toLocaleString('ko-KR')}명 · ${ind.passes_gate ? '통과' : '미달'}`}
          vColor={ind.passes_gate ? colors.text : colors.danger}
        />
        <KV k="목표 금액 상한" v={won(ind.target_cap)} />
        <T weight="700" style={{ marginTop: space(3) }}>상품 기간 총회수 (세후)</T>
        {SCEN.map(([key, label]) => (
          <KV
            key={key}
            k={label}
            v={`${mult(ind.scenarios[key].multiple)} · ${mon(ind.scenarios[key].payback_months)}`}
            vColor={(ind.scenarios[key].multiple ?? 0) < 1 ? colors.danger : colors.text}
          />
        ))}
        {ind.per_user_max_loss_downside > 0 ? (
          <Muted style={{ marginTop: space(1) }}>
            한도({won(ind.per_user_cap_amount)})까지 청약하고 유료 팬이 40%에 그치면 약 {won(ind.per_user_max_loss_downside)}를 잃을 수 있어요.
          </Muted>
        ) : null}
        <Muted size={12} style={{ marginTop: space(1) }}>{ind.note}</Muted>
      </Card>

      <H2>정산 공시</H2>
      <Card>
        <T weight="700">투자금 100원은 이렇게 쓰여요</T>
        <KV k="작가 제작비" v={`${disc.cost_per_100.creator}원`} />
        <KV k="발행 실비 (신고·법률·회계)" v={`${disc.cost_per_100.issuance_cost}원`} />
        <KV k="DIBS" v={`${disc.cost_per_100.dibs}원`} />
        <Muted style={{ marginTop: space(2) }}>{disc.settlement_basis}</Muted>
        {disc.reconciliation.map((r) => (
          <View key={r.period} style={{ marginTop: space(3) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T weight="700">{r.period} 정산 대사</T>
              <Badge label={r.matched ? '일치' : '불일치'} tone={r.matched ? 'accent' : 'danger'} />
            </Row>
            <KV k="유료 결제 (원천)" v={won(r.unlock_gross)} />
            <KV k="신탁 계좌 입금" v={won(r.trust_inflow)} />
            <KV k="배당 재원 기록" v={r.recorded_gross === null ? '분기 집계 전' : won(r.recorded_gross)} />
            <KV k="신탁을 거치지 않은 결제" v={`${r.leaked_unlocks}건`} vColor={r.leaked_unlocks ? colors.danger : colors.text} />
            <Muted size={12}>원장 해시 {r.ledger_hash.slice(0, 16)}… ({r.records}건)</Muted>
          </View>
        ))}
        {disc.verification.map((v) => (
          <Muted key={v} size={12} style={{ marginTop: space(1) }}>· {v}</Muted>
        ))}
      </Card>

      <H2>목표를 넘으면 이렇게 나눠요</H2>
      <Card>
        <T>발행량의 <T weight="700" color={colors.accent}>{bps(t.allocation_params.equal_ratio_bps ?? 0)}</T>는 참여자 모두에게 고르게, 나머지는 청약 비율대로 배정해요.</T>
        {t.allocation_params.early_reader_bps ? (
          <T style={{ marginTop: space(1) }}>그중 <T weight="700" color={colors.accent}>{bps(t.allocation_params.early_reader_bps)}</T>는 모집 7일 전까지 찜하고 파일럿을 완독한 초기 독자에게 먼저 나눠요.</T>
        ) : null}
        <Muted style={{ marginTop: space(1) }}>비례분은 청약 수량대로 나누고, 균등분이 모자라면 공개 추첨해요. 배정 못 받은 금액은 마감 직후 바로 돌려드려요.</Muted>
      </Card>

      <H2>손익분기 규모</H2>
      <Card>
        {be.lines.map((l) => (
          <View key={l.goal} style={{ marginBottom: space(2) }}>
            <T weight="700">{l.goal}</T>
            <Muted>연재 중 회차({be.price_coin}원)마다 {l.buyers_per_episode.toLocaleString('ko-KR')}명 결제 · 연 투자자 분배금(세후) {won(l.holder_dividend_per_year)}</Muted>
          </View>
        ))}
        <Muted size={12}>유료 팬 1명이 월 4화를 사고, 완결 뒤 매출은 40%에서 연 30%씩 줄며, 회수 전 투자자 몫 45%·원천징수 15.4%를 가정한 값이에요. 수익을 보장하지 않아요.</Muted>
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
        <KV k="상품 기간" v="시즌 연재 + 완결 후 12개월 (저매출 2분기 연속이면 더 일찍 종료)" />
        <KV k="작가 매입 옵션" v={t.buyback_enabled ? '선택함 · 최근 4분기 분배금 × 3으로 전량 매입' : '선택 안 함'} />
        <KV k="선공개 독점" v={`상장 후 ${t.exclusive_months}개월`} />
        <KV k="독점 종료 후" v={`외부 연재·영상화 수익(작가 몫)의 ${bps(t.external_share_bps)}를 순매출에 포함`} />
        <KV k="거래 수수료" v="0.015% (거래소·증권사 몫)" />
        <Muted style={{ marginTop: space(2) }}>{f.use_of_funds}</Muted>
      </Card>
      <DNote title="잠깐, 꼭 확인해 주세요" text="매우 높은 위험 상품이에요. 시즌이 끝나고 12개월이 지나면 권리가 사라지고 원금은 상환되지 않아요. 분배금으로만 원금을 회수하는 구조라 유료 팬이 예상보다 적으면 원금 손실이 나요. 예금자 보호 대상이 아니에요." />
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
