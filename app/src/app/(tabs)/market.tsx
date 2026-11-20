import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import { DEmpty } from '@/components/dibby';
import { Button, ChipRow, Cover, DisclosureBar, DScreen, IndexChart, MarketCell, Panel, PortfolioSummary, Section, Segmented, TopAppBar, Txt, color, spacing } from '@/ds';
import { api, type Candle, type Holding, type MySubscription, type SecurityItem, type Wallet, type WorkCard } from '@/lib/api';
import { manwon, marketIndex, signedPct, trendOf, typeLabel } from '@/lib/cards';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Sort = 'change' | 'latest' | 'price';

// V2 11 증권 홈 (총 자산 · 예치금 · 보유 조각) + V2 12 조각 마켓
export default function Market() {
  const { me } = useSession();
  const [sort, setSort] = useState<Sort>('change');
  const [chip, setChip] = useState('전체');
  const { data, error, loading, reload } = useApi(async () => {
    const [list, works, holdings, wallet, subs] = await Promise.all([
      api.get<SecurityItem[]>('/market/securities', { sort: sort === 'latest' ? 'latest' : 'change' }),
      api.get<WorkCard[]>('/works', { limit: 100 }),
      me ? api.get<Holding[]>('/me/holdings') : Promise.resolve([] as Holding[]),
      me ? api.get<Wallet>('/wallet') : Promise.resolve(null),
      me ? api.get<MySubscription[]>('/me/subscriptions') : Promise.resolve([] as MySubscription[]),
    ]);
    const charts = await Promise.all(list.slice(0, 12).map((x) => api.get<Candle[]>(`/market/securities/${x.funding_id}/chart`, { days: 14 }).catch(() => [] as Candle[])));
    return { list, works, holdings, charts, wallet, subs };
  }, [sort, me?.id]);

  const typeOf = useMemo(() => new Map((data?.works ?? []).map((w) => [w.id, typeLabel(w.type)])), [data]);
  const mine = new Set((data?.holdings ?? []).map((h) => h.funding_id));
  const list = [...(data?.list ?? [])].sort((a, b) => (sort === 'price' ? (b.last_price ?? b.unit_price) - (a.last_price ?? a.unit_price) : 0)).filter((x) => chip === '전체' || (chip === '보유' ? mine.has(x.funding_id) : typeOf.get(x.work_id) === chip));
  const idx = marketIndex(data?.list ?? []);
  const subsAmt = (data?.subs ?? []).filter((x) => x.status === 'ACTIVE').reduce((a, x) => a + x.units * x.unit_price, 0);
  const pnl = (data?.holdings ?? []).reduce((a, h) => a + h.pnl, 0);
  const total = (data?.holdings ?? []).reduce((a, h) => a + h.eval_amount, 0) + subsAmt + (data?.wallet?.deposit_available ?? 0);
  // 지수 흐름: 종목별 일봉 종가 ÷ 공모가의 날짜별 평균
  const series = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, number[]>();
    data.charts.forEach((cs, i) => cs.forEach((c) => {
      const r = c.close / (data.list[i]?.unit_price || 1);
      byDate.set(c.date, [...(byDate.get(c.date) ?? []), r]);
    }));
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rs]) => (rs.reduce((a, b) => a + b, 0) / rs.length) * 1000);
  }, [data]);

  return (
    <DScreen header={<TopAppBar type="Main" />} onRefresh={reload} tabBar>
      {data?.wallet ? (
        <>
          <PortfolioSummary
            label="총 자산"
            badge={data.wallet.mode === 'MOCK' ? '모의 거래' : undefined}
            total={Math.round(total).toLocaleString('ko-KR')}
            change={pnl ? `${pnl > 0 ? '+' : '−'}${manwon(Math.abs(pnl))} 평가손익` : undefined}
            trend={trendOf(pnl)}
            items={[
              ...data.holdings.map((h) => ({ label: h.work_title, value: h.eval_amount })),
              ...(subsAmt ? [{ label: '청약 중', value: subsAmt }] : []),
              ...(data.wallet.deposit_available ? [{ label: '예치금', value: data.wallet.deposit_available }] : []),
            ]}
          />
          <Panel>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt v="label1" w="semibold" c={color.labelStrong}>예치금</Txt>
              <Txt v="caption1" c={color.labelAlternative}>{me?.broker_account_masked ? `연결 계좌 ${me.broker_account_masked}` : data.wallet.mode === 'MOCK' ? '모의 계좌' : '연결 계좌'}</Txt>
            </View>
            <Txt v="title2" w="bold" c={color.labelStrong} tabular>{`${data.wallet.deposit_available.toLocaleString('ko-KR')}원`}</Txt>
            <View style={{ flexDirection: 'row', gap: spacing.gapM }}>
              <View style={{ flex: 1 }}><Button label="충전" size="Medium" onPress={() => router.push('/wallet')} /></View>
              <View style={{ flex: 1 }}><Button label="출금" variant="Outlined" tone="Assistive" size="Medium" onPress={() => router.push('/wallet')} /></View>
            </View>
          </Panel>
          {data.holdings.length ? (
            <Section title="보유 조각" count="평가손익 기준">
              {data.holdings.map((h, i) => {
                const wid = data.list.find((x) => x.funding_id === h.funding_id)?.work_id ?? h.funding_id;
                const w = data.works.find((x) => x.id === wid);
                return (
                  <Pressable key={h.funding_id} onPress={() => router.push(`/security/${h.funding_id}`)} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, paddingVertical: spacing.insetM }, i > 0 && { borderTopWidth: 1, borderTopColor: color.lineAlternative }]}>
                    <View style={{ width: 44 }}><Cover id={wid} title={h.work_title} url={w?.cover_url} size="Small" /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{h.work_title}</Txt>
                      <Txt v="caption1" c={color.labelAlternative}>{`${h.units.toLocaleString('ko-KR')}조각 · 평균 ${h.avg_price.toLocaleString('ko-KR')}원`}</Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Txt v="label1" w="bold" c={color.labelStrong} tabular>{`${h.eval_amount.toLocaleString('ko-KR')}원`}</Txt>
                      <Txt v="caption1" w="semibold" c={h.pnl >= 0 ? color.rise : color.fall} tabular>{signedPct(h.pnl_pct)}</Txt>
                    </View>
                  </Pressable>
                );
              })}
            </Section>
          ) : null}
        </>
      ) : null}

      <Txt v="headline1" w="bold" c={color.labelStrong}>조각 마켓</Txt>
      {data ? (
        <IndexChart
          name="조각 마켓 지수"
          value={idx.value.toFixed(2)}
          change={`${idx.change >= 0 ? '+' : '−'}${Math.abs(idx.change).toFixed(2)} (${signedPct(idx.changePct, 2)})`}
          asof="공모가 = 1,000 기준"
          values={series.length > 1 ? series : [1000, idx.value]}
          up={idx.change >= 0}
        />
      ) : null}
      <View style={{ gap: spacing.gapL }}>
        <ChipRow items={['전체', '웹툰', '웹소설', '보유']} value={chip} onChange={setChip} />
        <Segmented size="Small" value={sort} onChange={setSort} options={[{ key: 'change', label: '등락률' }, { key: 'latest', label: '최신 상장' }, { key: 'price', label: '가격' }]} />
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : null}
        <View>
          {list.map((x, i) => (
            <MarketCell
              key={x.funding_id}
              id={x.work_id}
              title={x.work_title}
              meta={`${typeOf.get(x.work_id) ?? '웹툰'} · 공모가 ${x.unit_price.toLocaleString('ko-KR')}원${x.status === 'SUSPENDED' ? ' · 거래 정지' : ''}`}
              price={(x.last_price ?? x.unit_price).toLocaleString('ko-KR')}
              change={signedPct(x.change_pct)}
              trend={trendOf(x.change_pct)}
              favorite={mine.has(x.funding_id)}
              last={i === list.length - 1}
              onPress={() => router.push(`/security/${x.funding_id}`)}
            />
          ))}
          {data && !list.length ? <DEmpty pose="peek" title="조건에 맞는 종목이 없어요" text="펀딩이 끝나고 발행되면 여기서 거래할 수 있어요." /> : null}
        </View>
      </View>
      <DisclosureBar text="모의 거래 · 실제 체결은 장외거래소 개장 후 · 가격제한폭 ±30%" />
    </DScreen>
  );
}

export const marketColor = color.rise;
