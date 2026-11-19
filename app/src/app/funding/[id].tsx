import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import {
  Badge, Button, Callout, DisclosureBar, DScreen, IconButton, InvestSummary, KV, OfferingTable, OfferingTimeline, Panel, ReturnSim, RiskLevel, Section,
  Tabs, TopAppBar, Txt, color, spacing,
} from '@/ds';
import { api, track, type Disclosure, type FundingDetail, type Indicators, type Serial, type Subscription, type WorkDetail } from '@/lib/api';
import { ddayText, manwon, typeLabel } from '@/lib/cards';
import { bps, dateText } from '@/lib/format';
import { useApi } from '@/lib/useApi';

type Tab = 'invest' | 'work' | 'serial' | 'disclosure';
const SERIAL_LABEL: Record<Serial['state'], string> = {
  ON_TRACK: '연재 정상', WARNING: '연재 지연', BREACH: '기한 초과', COMPLETED: '시즌 완결', EARLY_COMPLETED: '조기 완결', DISCONTINUED: '연재 중단',
};
const SPECIAL_LABEL: Record<string, string> = { DISCONTINUE: '연재 중단', EARLY_COMPLETION: '조기 완결', ESCROW_FORFEIT: '유보금', CLAWBACK: '작가 반환금' };

// V2 07 작품 상세 (투자 정보 · 작품 소개 · 연재 약정 · 공시)
export default function FundingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('invest');
  const { data, error, loading, reload } = useApi(
    async () => {
      const [f, ind, disc, ser] = await Promise.all([
        api.get<FundingDetail>(`/fundings/${id}`),
        api.get<Indicators>(`/fundings/${id}/indicators`),
        api.get<Disclosure>(`/fundings/${id}/disclosure`),
        api.get<Serial>(`/fundings/${id}/serial`),
      ]);
      const work = await api.get<WorkDetail>(`/works/${f.work_id}`);
      let sub: Subscription | null = null;
      try {
        sub = await api.get<Subscription>(`/fundings/${id}/subscriptions/me`);
      } catch {
        /* 청약 없음 */
      }
      return { f, ind, disc, ser, work, sub };
    },
    [id],
    30_000,
  );
  useEffect(() => track('FUNDING_VIEW', { funding_id: Number(id) }), [id]);

  const header = <TopAppBar type="Sub" title="작품 상세" actions={[{ icon: 'home', label: '홈', onPress: () => router.replace('/') }]} />;
  if (!data) {
    return (
      <DScreen header={header}>
        <Stack.Screen options={{ headerShown: false }} />
        {loading ? <Loading /> : <ErrorBox error={error} onRetry={reload} />}
      </DScreen>
    );
  }
  const { f, ind, disc, ser, work, sub } = data;
  const open = f.status === 'OPEN';
  const listed = f.status === 'LISTED' || f.status === 'SUSPENDED';
  const pct = Math.round(f.progress.achievement_pct);
  const toggleDib = async () => {
    if (work.is_dibbed) await api.del(`/works/${work.id}/dib`);
    else await api.put(`/works/${work.id}/dib`);
    reload();
  };
  const sc = ind.scenarios;
  const amount = Math.min(100_000, ind.per_user_cap_amount || 100_000);

  return (
    <DScreen
      header={header}
      onRefresh={reload}
      footer={
        <>
          <IconButton icon={work.is_dibbed ? 'star' : 'starL'} label={work.is_dibbed ? '관심 해제' : '관심 등록'} variant="Background" c={work.is_dibbed ? color.cautionary : color.labelStrong} onPress={toggleDib} />
          <View style={{ flex: 1 }}>
            {listed ? (
              <Button label="조각 시세 보기" onPress={() => router.push(`/security/${f.id}`)} />
            ) : (
              <Button
                label={sub?.status === 'ACTIVE' ? `청약 ${sub.units}조각 · 수량 바꾸기` : `${f.unit_price.toLocaleString('ko-KR')}원부터 투자하기`}
                disabled={!open}
                onPress={() => router.push(`/subscribe/${f.id}`)}
              />
            )}
          </View>
        </>
      }>
      <Stack.Screen options={{ headerShown: false }} />
      <InvestSummary
        id={f.work_id}
        title={f.work_title}
        by={`${typeLabel(work.type)} · ${work.genre} · 관심 ${work.dib_count.toLocaleString('ko-KR')}명`}
        format={typeLabel(work.type)}
        coverUrl={work.cover_url}
        status={listed ? 'Trading' : open ? 'Recruiting' : 'Closed'}
        statusText={listed ? '거래 중' : open ? (ddayText(f) ? `청약 중 · ${ddayText(f)}` : '청약 중') : '모집 마감'}
        mainValue={`${pct.toLocaleString('ko-KR')}%`}
        mainSub={`${manwon(f.progress.raised_amount)} / 목표 ${manwon(f.target_amount)}`}
        progress={pct}
        stats={[
          { label: '1조각 공모가', value: `${f.unit_price.toLocaleString('ko-KR')}원` },
          { label: '정산 주기', value: '분기' },
          { label: '위험 등급', value: f.risk_grade || '매우 높음' },
        ]}
      />

      <Tabs value={tab} onChange={setTab} options={[{ key: 'invest', label: '투자 정보' }, { key: 'work', label: '작품 소개' }, { key: 'serial', label: '연재 약정' }, { key: 'disclosure', label: '공시' }]} />

      {tab === 'invest' ? (
        <>
          <Section title="공모 조건" size="Medium">
            <OfferingTable
              rows={[
                { k: '모집 금액', v: manwon(f.target_amount), strong: true },
                { k: '1조각', v: `${f.unit_price.toLocaleString('ko-KR')}원` },
                { k: '1인 한도', v: `${f.per_user_cap_units.toLocaleString('ko-KR')}조각 (${manwon(f.per_user_cap_units * f.unit_price)})` },
                { k: '상품 기간', v: `시즌 ${ind.season_months}개월 + 완결 후 ${ind.tail_months}개월` },
                { k: '매출 배분', v: `회수 전 ${bps(f.terms.royalty_holder_bps)} → 회수 후 ${bps(f.terms.royalty_holder_after_bps)}` },
                { k: '배정', v: `균등 ${bps(f.terms.allocation_params.equal_ratio_bps ?? 2000)} · 비례 ${bps(10000 - (f.terms.allocation_params.equal_ratio_bps ?? 2000))}` },
                { k: '원금 상환', v: '없음 (분배금으로 회수)' },
              ]}
            />
          </Section>
          <Section title="청약 일정" size="Medium">
            <OfferingTimeline
              steps={[
                { label: '청약 시작', date: dateText(f.open_at) || '-', state: 'done' },
                { label: '청약 마감', date: dateText(f.close_at) || '-', state: open ? 'now' : 'done' },
                { label: '배정·환불', date: '마감 다음 날', state: open ? 'next' : listed ? 'done' : 'now' },
                { label: '발행·상장', date: '배정 후 약 1주', state: listed ? 'done' : 'next' },
                { label: '첫 분기 정산', date: '분기 말 다음 달 10일', state: 'next' },
              ]}
            />
          </Section>
          <RiskLevel level={5} note={`원금을 잃을 수 있고 예금자 보호 대상이 아니에요. 1인 최대 손실(유료 팬이 예상의 40%일 때) 약 ${manwon(ind.per_user_max_loss_downside)}.`} />
          <ReturnSim
            amount={amount}
            rows={[
              { label: '유료 팬 40%', multiple: sc.downside.multiple, months: sc.downside.payback_months },
              { label: '유료 팬 70% (기준)', multiple: sc.conservative.multiple, months: sc.conservative.payback_months },
              { label: '예상대로 (100%)', multiple: sc.base.multiple, months: sc.base.payback_months },
              { label: '150%', multiple: sc.optimistic.multiple, months: sc.optimistic.payback_months },
            ]}
            note="연 수익률은 기간이 짧아 과장되므로 배수와 회수 달만 보여 드려요. 과거·예상 수치는 미래 수익을 보장하지 않아요."
          />
          <Panel>
            <Txt v="body1" w="bold" c={color.labelStrong}>수요 지표</Txt>
            <KV k="관심(찜) · 최근 7일" v={`${ind.dibs_total.toLocaleString('ko-KR')}명 · +${ind.dibs_7d.toLocaleString('ko-KR')}`} />
            <KV k="파일럿 4주 유료 팬" v={`${ind.pilot_paying_fans_4w.toLocaleString('ko-KR')}명`} />
            <KV k="이 금액에 필요한 유료 팬" v={`${ind.paying_fans_needed.toLocaleString('ko-KR')}명`} vColor={ind.passes_gate ? color.positive : color.cautionary} />
          </Panel>
        </>
      ) : null}

      {tab === 'work' ? (
        <Section title="작품 소개" size="Medium">
          <Txt v="body2" c={color.labelNormal}>{work.synopsis || '작품 소개가 아직 없어요.'}</Txt>
          <Button label={`${work.episode_count}화 보러 가기`} tone="Assistive" size="Medium" onPress={() => router.push(`/work/${work.id}`)} />
          {f.reward_tiers.length ? (
            <View style={{ gap: spacing.gapM }}>
              <Txt v="body1" w="bold" c={color.labelStrong}>함께 받는 리워드</Txt>
              {f.reward_tiers.map((r) => <KV key={r.id} k={r.title} v={`${r.min_units}조각부터`} />)}
            </View>
          ) : null}
        </Section>
      ) : null}

      {tab === 'serial' ? (
        <Panel>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt v="body1" w="bold" c={color.labelStrong}>시즌 {ser.committed_episodes}화 · 한 달 {ser.monthly_quota}화</Txt>
            <Badge label={SERIAL_LABEL[ser.state]} type={ser.state === 'ON_TRACK' || ser.state === 'COMPLETED' ? 'Recruiting' : 'Deadline'} />
          </View>
          <KV k="연재 진행" v={`${ser.published}화 / 기한상 ${ser.expected}화`} vColor={ser.delay_episodes ? color.negative : undefined} />
          <KV k="미리 알린 휴재" v={`${ser.hiatus_weeks_used}주 / ${ser.hiatus_limit_weeks}주`} />
          {ser.creator_escrow_balance ? <KV k="유보 중인 작가 매출 몫" v={manwon(ser.creator_escrow_balance)} /> : null}
          {ser.clawback_due ? <KV k="작가 반환 청구 (남은 금액)" v={manwon(ser.clawback_outstanding)} vColor={color.negative} /> : null}
          {ser.special_distributions.map((d) => <KV key={d.id} k={`특별 분배 · ${SPECIAL_LABEL[d.kind] ?? d.kind}`} v={`${manwon(d.amount)}${d.status === 'PAID' ? '' : ' (지급 중)'}`} />)}
          <Callout>
            {`작가 제작비는 상장 40% · ${Math.ceil(ser.committed_episodes / 2)}화 30% · ${ser.committed_episodes}화 30%로 나눠 지급해요. ${ser.rules.delay_breach_episodes}화가 밀리면 남은 제작비를 보유자에게 나누고, 작가 귀책이면 받은 제작비의 ${bps(ser.rules.clawback_bps)}를 돌려받아요.`}
          </Callout>
        </Panel>
      ) : null}

      {tab === 'disclosure' ? (
        <>
          <Panel>
            <Txt v="body1" w="bold" c={color.labelStrong}>투자금 100원은 이렇게 쓰여요</Txt>
            <KV k="작가 제작비" v={`${disc.cost_per_100.creator}원`} />
            <KV k="발행 실비 (신고·법률·회계)" v={`${disc.cost_per_100.issuance_cost}원`} />
            <KV k="DIBS" v={`${disc.cost_per_100.dibs}원`} />
            <Txt v="caption1" c={color.labelAlternative}>{disc.settlement_basis}</Txt>
          </Panel>
          {disc.reconciliation.map((r) => (
            <Panel key={r.period}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt v="body1" w="bold" c={color.labelStrong}>{r.period} 정산 대사</Txt>
                <Badge label={r.matched ? '일치' : '불일치'} type={r.matched ? 'Recruiting' : 'Deadline'} />
              </View>
              <KV k="유료 결제 (원천)" v={manwon(r.unlock_gross)} />
              <KV k="신탁 계좌 입금" v={manwon(r.trust_inflow)} />
              <KV k="신탁을 거치지 않은 결제" v={`${r.leaked_unlocks}건`} vColor={r.leaked_unlocks ? color.negative : undefined} />
              <Txt v="caption2" c={color.labelAssistive}>원장 해시 {r.ledger_hash.slice(0, 16)}… ({r.records}건)</Txt>
            </Panel>
          ))}
          {disc.verification.map((v) => <Txt key={v} v="caption1" c={color.labelAlternative}>· {v}</Txt>)}
        </>
      ) : null}

      <DisclosureBar />
    </DScreen>
  );
}
