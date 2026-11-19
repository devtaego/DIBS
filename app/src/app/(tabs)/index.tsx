import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import {
  Button, ChipRow, DisclosureBar, DScreen, Empty, IndexChart, MarketCell, Panel, PortfolioSummary, Section, Segmented, TopAppBar, Txt, WorkCard,
  color, spacing,
} from '@/ds';
import { api, type FundingCard, type Holding, type MySubscription, type SecurityItem, type Wallet, type WorkCard as Work } from '@/lib/api';
import { fundingToCard, manwon, marketIndex, signedPct, trendOf, typeLabel } from '@/lib/cards';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

// V2 04 홈
export default function Home() {
  const { me } = useSession();
  const [tab, setTab] = useState<'sub' | 'trade'>('sub');
  const [chip, setChip] = useState('전체');
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
  const filtered = cards.filter((x) => chip === '전체' || (chip === '목표 달성' ? x.c.pct >= 100 : x.c.format === chip));
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
            ...(m.holdings.map((h) => ({ label: h.work_title, value: h.eval_amount }))),
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

      {data ? (
        <IndexChart
          name="조각 마켓 지수"
          value={idx.value.toFixed(2)}
          change={`${idx.change >= 0 ? '+' : '−'}${Math.abs(idx.change).toFixed(2)} (${signedPct(idx.changePct, 2)})`}
          asof="모의 거래 기준"
          values={[1000, (1000 + idx.value) / 2 - idx.change * 0.2, idx.value]}
          up={idx.change >= 0}
        />
      ) : null}

      <View style={{ gap: spacing.gapL }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Segmented size="Small" value={tab} onChange={setTab} options={[{ key: 'sub', label: '청약' }, { key: 'trade', label: '거래' }]} />
          <Txt v="caption1" w="medium" c={color.labelAlternative}>{tab === 'sub' ? '실시간 청약 중' : '모의 거래 시세'}</Txt>
        </View>
        {tab === 'sub' ? (
          <Section title="청약 마감 임박" count={`${soon.length}건`}>
            {soon.length ? soon.slice(0, 3).map((x, i, a) => (
              <WorkCard key={x.f.id} data={x.c} last={i === a.length - 1} onPress={() => router.push(`/funding/${x.f.id}`)} />
            )) : <Empty title="3일 안에 마감하는 청약이 없어요" />}
          </Section>
        ) : (
          <Section title="오늘 많이 오른 조각" link="마켓" onLink={() => router.push('/market')}>
            {(data?.securities ?? []).slice(0, 4).map((x, i, a) => (
              <MarketCell
                key={x.funding_id}
                id={x.work_id}
                title={x.work_title}
                meta={`${typeLabel(workById.get(x.work_id)?.type)} · 공모가 ${manwon(x.unit_price)}`}
                price={(x.last_price ?? x.unit_price).toLocaleString('ko-KR')}
                change={signedPct(x.change_pct)}
                trend={trendOf(x.change_pct)}
                last={i === a.length - 1}
                onPress={() => router.push(`/security/${x.funding_id}`)}
              />
            ))}
            {data && !data.securities.length ? <Empty title="상장된 조각이 아직 없어요" /> : null}
          </Section>
        )}
      </View>

      <Section title="지금 모집 중" link="전체" onLink={() => router.push('/explore')} gap={spacing.gapM}>
        <ChipRow items={['전체', '웹툰', '웹소설', '목표 달성']} value={chip} onChange={setChip} />
        <View>
          {filtered.map((x, i) => (
            <WorkCard key={x.f.id} data={x.c} last={i === filtered.length - 1} onPress={() => router.push(`/funding/${x.f.id}`)} />
          ))}
          {data && !filtered.length ? <Empty title="조건에 맞는 모집이 없어요" text="새 청약이 열리면 알림으로 알려 드릴게요." /> : null}
        </View>
      </Section>

      <DisclosureBar />
    </DScreen>
  );
}
