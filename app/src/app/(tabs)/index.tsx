import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import {
  Button, DisclosureBar, DScreen, Empty, IndexChart, Panel, PortfolioSummary, Section, TopAppBar, Txt, WorkCard,
  color, spacing,
} from '@/ds';
import { api, type FundingCard, type Holding, type MySubscription, type SecurityItem, type Wallet, type WorkCard as Work } from '@/lib/api';
import { fundingToCard, manwon, marketIndex, signedPct, trendOf } from '@/lib/cards';
import { useSession } from '@/lib/session';
import { DEmpty } from '@/components/dibby';
import { useApi } from '@/lib/useApi';

// V2 04 홈
export default function Home() {
  const { me } = useSession();
  const [fmt, setFmt] = useState<'웹툰' | '웹소설'>('웹툰');
  const { data, error, loading, reload } = useApi(async () => {
    const [fundings, works, securities] = await Promise.all([
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
      api.get<Work[]>('/works', { limit: 100 }),
      api.get<SecurityItem[]>('/market/securities', { sort: 'change' }),
    ]);
    let mine: { wallet: Wallet; holdings: Holding[]; subs: MySubscription[] } | null = null;
    if (me) {
      const [wallet, holdings, subs] = await Promise.all([
        api.get<Wallet>('/wallet'), api.get<Holding[]>('/me/holdings'), api.get<MySubscription[]>('/me/subscriptions'),
      ]);
      mine = { wallet, holdings, subs };
    }
    return { fundings, works, securities, mine };
  }, [me?.id]);

  const workById = useMemo(() => new Map((data?.works ?? []).map((w) => [w.id, w])), [data]);
  const cards = (data?.fundings ?? []).map((f) => ({ f, c: fundingToCard(f, workById.get(f.work_id)) }));
  const soon = [...cards].filter((x) => (x.f.days_left ?? 99) <= 3).sort((a, b) => (a.f.days_left ?? 99) - (b.f.days_left ?? 99));
  const soonF = soon.filter((x) => x.c.format === fmt);
  const rest = cards.filter((x) => !soonF.includes(x)); // 마감 임박에 나온 펀딩은 다시 보여 주지 않는다
  const idx = marketIndex(data?.securities ?? []);

  const m = data?.mine;
  const activeSubs = (m?.subs ?? []).filter((x) => x.status === 'ACTIVE');
  const holdingsEval = (m?.holdings ?? []).reduce((a, h) => a + h.eval_amount, 0);
  const subsAmt = activeSubs.reduce((a, x) => a + x.units * x.unit_price, 0);
  const pnl = (m?.holdings ?? []).reduce((a, h) => a + h.pnl, 0);
  const total = holdingsEval + subsAmt + (m?.wallet.deposit_available ?? 0);

  return (
    <DScreen header={<TopAppBar type="Main" />} onRefresh={reload} tabBar gap={spacing.gap2xl} padTop={spacing.insetL}>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}

      {m ? (
        <PortfolioSummary
          total={Math.round(total).toLocaleString('ko-KR')}
          change={pnl ? `${pnl > 0 ? '+' : '−'}${manwon(Math.abs(pnl))} 평가손익` : undefined}
          trend={trendOf(pnl)}
          items={[
            // 작품이 늘어도 세 칸으로: 투자한 작품 / 청약 중 / 예치금
            ...(m.holdings.length ? [{ label: `투자한 작품 ${m.holdings.length}`, value: m.holdings.reduce((x, h) => x + h.eval_amount, 0) }] : []),
            ...(subsAmt ? [{ label: '청약 중', value: subsAmt }] : []),
            ...(m.wallet.deposit_available ? [{ label: '예치금', value: m.wallet.deposit_available }] : []),
          ]}
          onMore={() => router.push('/portfolio')}
        />
      ) : (
        <Panel>
          <Txt v="headline2" w="bold" c={color.labelStrong}>읽던 작품에 1만 원부터 투자해 보세요</Txt>
          <Txt v="label2" c={color.labelAlternative}>로그인하면 내 투자 자산과 청약 현황을 여기서 볼 수 있어요.</Txt>
          <Button label="시작하기" size="Medium" onPress={() => router.push('/login')} />
        </Panel>
      )}

      {data?.securities.length ? (
        <IndexChart
          name="DIBS IP 지수"
          value={idx.value.toFixed(2)}
          change={`${idx.change >= 0 ? '▲' : '▼'} ${signedPct(idx.changePct, 2)}`}
          asof="공모가 = 1,000 기준"
          values={[1000, (1000 + idx.value) / 2 - idx.change * 0.2, idx.value]}
          up={idx.change >= 0}
        />
      ) : null}

      <View style={{ gap: spacing.gapS }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', gap: spacing.gapL }} accessibilityRole="tablist">
            {(['웹툰', '웹소설'] as const).map((k) => (
              <Pressable key={k} onPress={() => setFmt(k)} accessibilityRole="tab" accessibilityState={{ selected: fmt === k }} style={{ paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: fmt === k ? color.labelStrong : 'transparent' }}>
                <Txt v="label1" w={fmt === k ? 'bold' : 'medium'} c={fmt === k ? color.labelStrong : color.labelAlternative}>{k}</Txt>
              </Pressable>
            ))}
          </View>
          <Txt v="caption1" w="medium" c={color.labelAlternative}>실시간 청약 중</Txt>
        </View>
        <Section title="청약 마감 임박" count={`${soonF.length}건`}>
          {soonF.length ? soonF.slice(0, 3).map((x, i, arr) => (
            <WorkCard key={x.f.id} data={x.c} last={i === arr.length - 1} onPress={() => router.push(`/funding/${x.f.id}`)} />
          )) : <Empty title={`3일 안에 마감하는 ${fmt} 청약이 없어요`} />}
        </Section>
      </View>

      <Section title="지금 모집 중" link="전체" onLink={() => router.push('/explore')}>
        <View>
          {rest.slice(0, 5).map((x, i, arr) => (
            <WorkCard key={x.f.id} data={x.c} last={i === arr.length - 1} onPress={() => router.push(`/funding/${x.f.id}`)} />
          ))}
          {data && !cards.length ? <DEmpty pose="sleep" title="지금 모집 중인 펀딩이 없어요" text="새 청약이 열리면 디비가 먼저 알려드릴게요." /> : null}
        </View>
      </Section>

      <DisclosureBar />
    </DScreen>
  );
}
