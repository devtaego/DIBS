import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Dibby } from '@/components/dibby';
import { ErrorBox, Loading } from '@/components/ui';
import { CoverImg, DropBtn, Sheet, SheetOptions, Spark, TabHeader, TextTabs, Txt, V2Screen, color, pctText, signed, wonText } from '@/ds';
import { api, type Holding, type SecurityItem, type WorkCard } from '@/lib/api';
import { marketIndex } from '@/lib/cards';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

// 11 토큰증권 · 메인 (Screens – MVP v2)
// 내 평가금액 카드 · DIBS IP 지수 · 종목 목록(전체/웹툰/웹소설, 정렬)
type Candle = { date: string; close: number };
const SORTS = ['상승률순', '하락률순', '가격 높은순', '이름순'] as const;
type Sort = (typeof SORTS)[number];

export default function SecuritiesTab() {
  const { me } = useSession();
  const [fmt, setFmt] = useState<'전체' | '웹툰' | '웹소설'>('전체');
  const [sort, setSort] = useState<Sort>('상승률순');
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useApi(async () => {
    const [list, works] = await Promise.all([api.get<SecurityItem[]>('/market/securities', { sort: 'change' }), api.get<WorkCard[]>('/works', { limit: 100 })]);
    const charts = await Promise.all(list.map((s) => api.get<Candle[]>(`/market/securities/${s.funding_id}/chart`).catch(() => [] as Candle[])));
    const holdings = me ? await api.get<Holding[]>('/me/holdings') : [];
    return { list, works, charts, holdings };
  }, [me?.id]);

  const workById = useMemo(() => new Map((data?.works ?? []).map((w) => [w.id, w])), [data]);
  const rows = useMemo(() => {
    const all = (data?.list ?? []).map((s, i) => ({ s, w: workById.get(s.work_id), chart: data?.charts[i] ?? [] }));
    const f = all.filter((r) => fmt === '전체' || (fmt === '웹소설') === (r.w?.type === 'WEBNOVEL'));
    const ch = (r: (typeof all)[number]) => r.s.change_pct ?? 0;
    const px = (r: (typeof all)[number]) => r.s.last_price ?? r.s.unit_price;
    return [...f].sort((a, b) => sort === '상승률순' ? ch(b) - ch(a) : sort === '하락률순' ? ch(a) - ch(b) : sort === '가격 높은순' ? px(b) - px(a) : a.s.work_title.localeCompare(b.s.work_title, 'ko'));
  }, [data, workById, fmt, sort]);

  const evalSum = (data?.holdings ?? []).reduce((a, h) => a + h.eval_amount, 0);
  const pnl = (data?.holdings ?? []).reduce((a, h) => a + h.pnl, 0);
  const cost = evalSum - pnl;
  const idx = marketIndex(data?.list ?? []);
  const idxSeries = [1000, ...rows.map((r) => r.s.last_price ?? r.s.unit_price).slice(0, 8).map((p, i, a) => 1000 + ((idx.value - 1000) * (i + 1)) / a.length)];

  return (
    <V2Screen header={<TabHeader title="토큰증권" badge="STO" />} tabBar pad={20}>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}

      <Pressable onPress={() => router.push('/portfolio')} accessibilityRole="button" accessibilityLabel="내 토큰증권 보기"
        style={{ marginTop: 6, paddingTop: 18, paddingBottom: 20, paddingHorizontal: 20, borderRadius: 24, backgroundColor: '#FBDCE7',
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', shadowColor: '#C4426F', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 3 }}>
        <Txt v="label2" w="semibold" c={color.labelAlternative}>토큰증권 평가금액</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
          <Txt v="title1" w="bold" c={color.labelStrong} tabular>{Math.round(evalSum).toLocaleString('ko-KR')}</Txt>
          <Txt v="headline1" w="semibold" c={color.labelStrong}>원</Txt>
        </View>
        {me ? (
          <Txt v="label1" w="bold" c={pnl > 0 ? color.rise : pnl < 0 ? color.fall : color.labelAlternative} style={{ marginTop: 2 }}>
            {pnl >= 0 ? '▲' : '▼'} {signed(pnl).replace('+', '').replace('−', '')} ({pctText(cost ? (pnl / cost) * 100 : 0, 1)})
          </Txt>
        ) : <Txt v="label1" w="medium" c={color.labelAlternative} style={{ marginTop: 2 }}>로그인하면 보유 종목을 볼 수 있어요</Txt>}
        <View style={{ position: 'absolute', right: 18, bottom: 12 }} pointerEvents="none"><Dibby pose="report" size={64} /></View>
      </Pressable>

      <View style={{ marginTop: 14, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 10, borderRadius: 18, borderWidth: 1, borderColor: color.lineAlternative }}>
        <Txt v="label2" w="semibold" c={color.labelAlternative}>DIBS IP 지수</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <Txt v="heading2" w="bold" c={color.labelStrong} tabular>{idx.value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Txt>
          <Txt v="label2" w="bold" c={idx.change >= 0 ? color.rise : color.fall}>{idx.change >= 0 ? '▲' : '▼'} {Math.abs(idx.changePct ?? 0).toFixed(2)}%</Txt>
        </View>
        <View style={{ marginTop: 6 }}><Spark values={idxSeries} up={idx.change >= 0} w={318} h={40} area /></View>
        <Txt v="caption2" c={color.labelAssistive}>상장 종목 (현재가 ÷ 공모가) 평균 × 1,000</Txt>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 6 }}>
        <TextTabs items={['전체', '웹툰', '웹소설']} value={fmt} onChange={setFmt} />
        <View style={{ flex: 1 }} />
        <DropBtn label={sort} onPress={() => setOpen(true)} outline />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 28, borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
        <Txt v="caption2" w="semibold" c={color.labelAssistive} style={{ flex: 1, paddingLeft: 60 }}>종목</Txt>
        <View style={{ width: 64 }} />
        <Txt v="caption2" w="semibold" c={color.labelAssistive} style={{ width: 72, textAlign: 'right' }}>현재가</Txt>
      </View>
      {rows.map(({ s, w, chart }) => {
        const price = s.last_price ?? s.unit_price;
        const up = (s.change_pct ?? 0) >= 0;
        const series = chart.length >= 3 ? chart.map((c) => c.close) : [s.reference_price ?? s.unit_price, price];
        return (
          <Pressable key={s.funding_id} onPress={() => router.push(`/security/${s.funding_id}`)} accessibilityRole="button" accessibilityLabel={`${s.work_title} ${wonText(price)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 84, borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
            <CoverImg id={s.work_id} url={w?.cover_url} title={s.work_title} w={46} h={69} r={8} />
            <Txt v="label1" w="semibold" c={color.labelStrong} lines={1} style={{ flex: 1 }}>{s.work_title}</Txt>
            <Spark values={series} up={up} w={64} h={26} />
            <View style={{ width: 72, alignItems: 'flex-end' }}>
              <Txt v="label1" w="bold" c={color.labelStrong} tabular>{wonText(price)}</Txt>
              <Txt v="caption1" w="bold" c={(s.change_pct ?? 0) > 0 ? color.rise : (s.change_pct ?? 0) < 0 ? color.fall : color.labelAlternative} tabular>{pctText(s.change_pct)}</Txt>
            </View>
          </Pressable>
        );
      })}
      {data && !rows.length ? <Txt v="label1" c={color.labelAlternative} center style={{ paddingVertical: 40 }}>거래 중인 종목이 없어요</Txt> : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title="정렬">
        <SheetOptions items={[...SORTS]} value={sort} onPick={(v) => { setSort(v as Sort); setOpen(false); }} />
      </Sheet>
    </V2Screen>
  );
}
