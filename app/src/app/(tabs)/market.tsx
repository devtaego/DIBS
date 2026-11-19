import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import { DEmpty } from '@/components/dibby';
import { ChipRow, DisclosureBar, DScreen, IndexChart, MarketCell, PageTitle, Segmented, TopAppBar, color, spacing } from '@/ds';
import { api, type Candle, type Holding, type SecurityItem, type WorkCard } from '@/lib/api';
import { marketIndex, signedPct, trendOf, typeLabel } from '@/lib/cards';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Sort = 'change' | 'latest' | 'price';

// V2 12 조각 마켓
export default function Market() {
  const { me } = useSession();
  const [sort, setSort] = useState<Sort>('change');
  const [chip, setChip] = useState('전체');
  const { data, error, loading, reload } = useApi(async () => {
    const [list, works, holdings] = await Promise.all([
      api.get<SecurityItem[]>('/market/securities', { sort: sort === 'latest' ? 'latest' : 'change' }),
      api.get<WorkCard[]>('/works', { limit: 100 }),
      me ? api.get<Holding[]>('/me/holdings') : Promise.resolve([] as Holding[]),
    ]);
    const charts = await Promise.all(list.slice(0, 12).map((x) => api.get<Candle[]>(`/market/securities/${x.funding_id}/chart`, { days: 14 }).catch(() => [] as Candle[])));
    return { list, works, holdings, charts };
  }, [sort, me?.id]);

  const typeOf = useMemo(() => new Map((data?.works ?? []).map((w) => [w.id, typeLabel(w.type)])), [data]);
  const mine = new Set((data?.holdings ?? []).map((h) => h.funding_id));
  const list = [...(data?.list ?? [])].sort((a, b) => (sort === 'price' ? (b.last_price ?? b.unit_price) - (a.last_price ?? a.unit_price) : 0)).filter((x) => chip === '전체' || (chip === '보유' ? mine.has(x.funding_id) : typeOf.get(x.work_id) === chip));
  const idx = marketIndex(data?.list ?? []);
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
      <PageTitle title="조각 마켓" />
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
