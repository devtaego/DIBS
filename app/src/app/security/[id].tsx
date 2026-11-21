import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { ErrorBox, Loading } from '@/components/ui';
import { CoverImg, HeadBtn, Icon, PINK, Txt, UnderTabs, color, pctText, wonText } from '@/ds';
import { api, type Candle, type OrderBook, type SecurityDetail, type Trade } from '@/lib/api';
import { dateText } from '@/lib/format';
import { useApi } from '@/lib/useApi';

// 06 토큰증권 · 종목 상세 (Screens – MVP v2): 기본정보 · 호가 · 차트, 아래 매도/매수 (주문은 키움증권으로)
type Tab = '기본정보' | '호가' | '차트';

export default function SecurityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('차트');
  const [star, setStar] = useState(false);
  const { data, error, loading, reload } = useApi(async () => {
    const [d, book, trades, chart] = await Promise.all([
      api.get<SecurityDetail>(`/market/securities/${id}`),
      api.get<OrderBook>(`/market/securities/${id}/orderbook`),
      api.get<Trade[]>(`/market/securities/${id}/trades`, { limit: 10 }),
      api.get<Candle[]>(`/market/securities/${id}/chart`, { days: 30 }),
    ]);
    const work = await api.get<{ cover_url?: string | null; type?: string }>(`/works/${d.work_id}`).catch(() => null);
    return { d, book, trades, chart, cover: work?.cover_url ?? null, type: work?.type };
  }, [id], 5_000);

  if (loading && !data) return <SafeAreaView style={{ flex: 1, backgroundColor: color.bgNormal }}><Loading /></SafeAreaView>;
  if (!data) return <SafeAreaView style={{ flex: 1, backgroundColor: color.bgNormal }}><ErrorBox error={error} onRetry={reload} /></SafeAreaView>;
  const { d, book, trades, chart, cover, type } = data;
  const price = d.last_price ?? d.unit_price;
  const ref = d.reference_price ?? d.unit_price;
  const diff = price - ref;
  const tone = diff > 0 ? color.rise : diff < 0 ? color.fall : color.labelStrong;
  const tradable = d.status === 'LISTED';
  const go = (side: 'BUY' | 'SELL', p?: number) => router.push({ pathname: '/order/[id]', params: { id: String(d.funding_id), side, price: String(p ?? price) } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bgNormal }} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <HeadBtn icon="back" label="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.replace('/securities'))} />
        <Txt v="headline2" w="bold" c={color.labelStrong} style={{ flex: 1 }}>종목 상세</Txt>
        <Pressable onPress={() => setStar(!star)} accessibilityRole="button" accessibilityLabel="관심 종목" accessibilityState={{ selected: star }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={star ? 'star' : 'starL'} size={24} c={star ? '#F0B400' : color.labelStrong} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingHorizontal: 24, paddingTop: 4, paddingBottom: 14 }}>
        <CoverImg id={d.work_id} url={cover} title={d.work_title} w={52} h={78} r={10} />
        <View style={{ flex: 1 }}>
          <Txt v="caption1" w="semibold" c={color.labelAssistive}>{d.security_code ?? 'DIBS'} · {type === 'WEBNOVEL' ? '웹소설' : '웹툰'} · 신탁 수익증권</Txt>
          <Txt v="headline1" w="bold" c={color.labelStrong} lines={1} style={{ marginVertical: 2 }}>{d.work_title}</Txt>
          <Txt v="heading2" w="bold" c={tone} tabular>{price.toLocaleString('ko-KR')}<Txt v="label1" w="semibold" c={tone}>원</Txt>{'  '}
            <Txt v="label2" w="bold" c={tone}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toLocaleString('ko-KR')} ({pctText(d.change_pct)})</Txt>
          </Txt>
        </View>
      </View>
      <UnderTabs items={['기본정보', '호가', '차트'] as Tab[]} value={tab} onChange={setTab} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {tab === '차트' ? <ChartTab chart={chart} price={price} trades={trades} /> : null}
        {tab === '호가' ? <BookTab book={book} d={d} chart={chart} onPick={(p) => go('BUY', p)} /> : null}
        {tab === '기본정보' ? <InfoTab d={d} cover={cover} /> : null}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.bgNormal, borderTopWidth: 1, borderTopColor: color.lineAlternative }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 }}>
          <Txt v="caption2" w="medium" c={color.labelAssistive} center style={{ marginBottom: 8 }}>{tradable ? '주문은 키움증권 앱에서 진행돼요' : '지금은 거래가 정지된 종목이에요'}</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['SELL', 'BUY'] as const).map((side) => (
              <Pressable key={side} disabled={!tradable} onPress={() => go(side)} accessibilityRole="button"
                style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 999, backgroundColor: !tradable ? color.interactionDisable : side === 'BUY' ? color.rise : color.fall, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                <Txt v="body1" w="bold" c={color.white}>{side === 'BUY' ? '매수' : '매도'}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

function ChartTab({ chart, price, trades }: { chart: Candle[]; price: number; trades: Trade[] }) {
  const W = 300, H = 180, VH = 40;
  const last = chart[chart.length - 1];
  const hi = Math.max(price, ...chart.map((c) => c.high)), lo = Math.min(price, ...chart.map((c) => c.low));
  const span = hi - lo || hi * 0.1 || 1;
  const y = (v: number) => 10 + (1 - (v - lo) / span) * (H - 20);
  const vmax = Math.max(1, ...chart.map((c) => c.volume));
  const step = W / Math.max(chart.length, 1);
  const bw = Math.max(3, Math.min(10, step * 0.6));
  const closes = chart.map((c, i) => `${i ? 'L' : 'M'}${(i * step + step / 2).toFixed(1)} ${y(c.close).toFixed(1)}`).join(' ');
  return (
    <View>
      {last ? (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12 }}>
          {[['시', last.open, color.labelStrong], ['고', last.high, color.rise], ['저', last.low, color.fall], ['종', last.close, last.close >= last.open ? color.rise : color.fall]].map(([k, v, c]) => (
            <Txt key={k as string} v="caption2" w="semibold" c={color.labelAssistive}>{k} <Txt v="caption2" w="bold" c={c as string}>{(v as number).toLocaleString('ko-KR')}</Txt></Txt>
          ))}
          <View style={{ flex: 1 }} />
          <Txt v="caption2" w="semibold" c={color.labelAssistive}>최근 30일 · 일봉</Txt>
        </View>
      ) : null}
      <View style={{ paddingLeft: 20, paddingRight: 8, paddingTop: 6 }}>
        {chart.length ? (
          <Svg width="100%" height={H + VH + 16} viewBox={`0 0 344 ${H + VH + 16}`}>
            {[0.25, 0.5, 0.75].map((r) => <Line key={r} x1={0} x2={W} y1={H * r} y2={H * r} stroke={color.labelStrong} strokeOpacity={0.08} />)}
            {chart.map((c, i) => {
              const x = i * step + step / 2;
              const up = c.close >= c.open;
              const col = up ? color.rise : color.fall;
              const top = y(Math.max(c.open, c.close)), bot = y(Math.min(c.open, c.close));
              const vh = (c.volume / vmax) * VH;
              return (
                <G key={c.date}>
                  <Line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1} />
                  <Rect x={x - bw / 2} y={top} width={bw} height={Math.max(1.2, bot - top)} fill={col} />
                  <Rect x={x - bw / 2} y={H + 12 + VH - vh} width={bw} height={vh} fill={col} opacity={0.45} />
                </G>
              );
            })}
            {chart.length > 1 ? <Path d={closes} stroke="#F5A524" strokeWidth={1.3} fill="none" /> : null}
            <Line x1={0} x2={W} y1={y(price)} y2={y(price)} stroke={color.rise} strokeDasharray="3 3" strokeWidth={1} />
            <Rect x={302} y={y(price) - 8} width={42} height={16} rx={3} fill={color.rise} />
            <SvgText x={323} y={y(price) + 3.5} fontSize={9.5} fontWeight="700" fill="#fff" textAnchor="middle">{price.toLocaleString('ko-KR')}</SvgText>
            <SvgText x={306} y={14} fontSize={9} fill={color.labelStrong} fillOpacity={0.45}>{hi.toLocaleString('ko-KR')}</SvgText>
            <SvgText x={306} y={H - 4} fontSize={9} fill={color.labelStrong} fillOpacity={0.45}>{lo.toLocaleString('ko-KR')}</SvgText>
            <Line x1={0} x2={W} y1={H + 10} y2={H + 10} stroke={color.labelStrong} strokeOpacity={0.1} />
            <SvgText x={306} y={H + 26} fontSize={9} fill={color.labelStrong} fillOpacity={0.45}>거래량</SvgText>
          </Svg>
        ) : <Txt v="label2" c={color.labelAlternative} style={{ paddingVertical: 40 }} center>아직 체결이 없어요</Txt>}
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, marginTop: 8, borderTopWidth: 1, borderBottomWidth: 1, borderTopColor: color.lineNormal, borderBottomColor: color.lineAlternative }}>
        {['체결 시각', '체결가', '체결량'].map((k, i) => <Txt key={k} v="caption2" w="semibold" c={color.labelAssistive} style={{ flex: 1, textAlign: i ? 'right' : 'left' }}>{k}</Txt>)}
      </View>
      {trades.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
          <Txt v="caption1" w="medium" c={color.labelNeutral} style={{ flex: 1 }}>{t.created_at.slice(11, 19) || dateText(t.created_at)}</Txt>
          <Txt v="caption1" w="semibold" c={color.labelStrong} style={{ flex: 1, textAlign: 'right' }} tabular>{t.price.toLocaleString('ko-KR')}</Txt>
          <Txt v="caption1" w="bold" c={t.price >= price ? color.rise : color.fall} style={{ flex: 1, textAlign: 'right' }} tabular>{t.units.toLocaleString('ko-KR')}</Txt>
        </View>
      ))}
      {!trades.length ? <Txt v="caption1" c={color.labelAssistive} center style={{ paddingVertical: 16 }}>최근 체결이 없어요</Txt> : null}
    </View>
  );
}

function BookTab({ book, d, chart, onPick }: { book: OrderBook; d: SecurityDetail; chart: Candle[]; onPick: (p: number) => void }) {
  const ref = book.reference_price ?? d.unit_price;
  const asks = [...book.asks].sort((a, b) => b.price - a.price).slice(-6);
  const bids = [...book.bids].sort((a, b) => b.price - a.price).slice(0, 6);
  const max = Math.max(1, ...asks.map((a) => a.units), ...bids.map((b) => b.units));
  const totA = book.asks.reduce((a, x) => a + x.units, 0), totB = book.bids.reduce((a, x) => a + x.units, 0);
  const last = chart[chart.length - 1];
  const pc = (p: number) => (p > ref ? color.rise : p < ref ? color.fall : color.labelStrong);
  const chg = (p: number) => pctText(ref ? ((p - ref) / ref) * 100 : 0);
  const Row = ({ p, u, sell }: { p: number; u: number; sell: boolean }) => (
    <Pressable onPress={() => onPick(p)} accessibilityRole="button" accessibilityLabel={`${p}원 ${sell ? '매도' : '매수'}잔량 ${u}`} style={{ flexDirection: 'row', height: 30, marginBottom: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8, backgroundColor: sell ? 'rgba(49,130,246,0.05)' : 'transparent' }}>
        {sell ? <><View style={{ position: 'absolute', right: 0, top: 3, bottom: 3, width: `${(u / max) * 100}%`, backgroundColor: 'rgba(49,130,246,0.16)' }} /><Txt v="caption1" w="semibold" c={color.labelNormal} tabular>{u.toLocaleString('ko-KR')}</Txt></> : null}
      </View>
      <View style={{ flex: 1.05, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: sell ? 'rgba(49,130,246,0.09)' : 'rgba(240,68,82,0.08)', borderWidth: p === (d.last_price ?? -1) ? 1.5 : 0, borderColor: color.labelStrong }}>
        <Txt v="label2" w="bold" c={pc(p)} tabular>{p.toLocaleString('ko-KR')}</Txt>
        <Txt v="caption2" w="medium" c={color.labelAssistive}>{chg(p)}</Txt>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 8, backgroundColor: !sell ? 'rgba(240,68,82,0.05)' : 'transparent' }}>
        {!sell ? <><View style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: `${(u / max) * 100}%`, backgroundColor: 'rgba(240,68,82,0.16)' }} /><Txt v="caption1" w="semibold" c={color.labelNormal} tabular>{u.toLocaleString('ko-KR')}</Txt></> : null}
      </View>
    </Pressable>
  );
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', height: 26, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
        <Txt v="caption2" w="semibold" c={color.labelAssistive} style={{ flex: 1, textAlign: 'right', paddingRight: 8 }}>매도잔량</Txt>
        <Txt v="caption2" w="semibold" c={color.labelAssistive} style={{ flex: 1.05, textAlign: 'center' }}>호가</Txt>
        <Txt v="caption2" w="semibold" c={color.labelAssistive} style={{ flex: 1, paddingLeft: 8 }}>매수잔량</Txt>
      </View>
      <View style={{ marginTop: 2 }}>
        {asks.map((a) => <Row key={`a${a.price}`} p={a.price} u={a.units} sell />)}
        {bids.map((b) => <Row key={`b${b.price}`} p={b.price} u={b.units} sell={false} />)}
        {!asks.length && !bids.length ? <Txt v="caption1" c={color.labelAssistive} center style={{ paddingVertical: 24 }}>올라온 주문이 없어요</Txt> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        {[['기준가', ref, color.labelStrong], ['시가', last?.open, color.rise], ['고가', last?.high, color.rise], ['저가', last?.low, color.fall], ['상한가', book.price_band.max, color.rise], ['하한가', book.price_band.min, color.fall]]
          .filter(([, v]) => v != null).map(([k, v, c]) => (
            <Txt key={k as string} v="caption2" w="medium" c={color.labelAssistive}>{k} <Txt v="caption2" w="bold" c={c as string}>{(v as number).toLocaleString('ko-KR')}</Txt></Txt>
          ))}
      </View>
      <View style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="caption1" w="bold" c={color.fall}>총 매도 {totA.toLocaleString('ko-KR')}</Txt>
          <Txt v="caption1" w="bold" c={color.rise}>총 매수 {totB.toLocaleString('ko-KR')}</Txt>
        </View>
        <View style={{ flexDirection: 'row', height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 5, backgroundColor: color.fillNormal }}>
          <View style={{ flex: totA || 0.0001, backgroundColor: color.fall }} />
          <View style={{ flex: totB || 0.0001, backgroundColor: color.rise }} />
        </View>
      </View>
      <Txt v="caption2" c={color.labelAssistive} style={{ marginTop: 10 }}>호가를 누르면 그 가격으로 주문을 시작해요. 호가 단위 10원 · 가격제한폭 기준가 ±30%.</Txt>
    </View>
  );
}

function InfoTab({ d, cover }: { d: SecurityDetail; cover: string | null }) {
  const price = d.last_price ?? d.unit_price;
  const cap = price * d.total_units;
  const capText = cap >= 1e8 ? `${(cap / 1e8).toFixed(1)}억` : `${Math.round(cap / 1e4).toLocaleString('ko-KR')}만`;
  const cells: [string, string, string?, string?][] = [
    ['최근 7일 거래량', `${d.volume_7d.toLocaleString('ko-KR')}조각`, `${d.trades_7d}건`, '최근 7일 동안 체결된 조각 수'],
    ['시가총액', capText, undefined, '최신 체결가 × 전체 발행 조각 수'],
    ['최근 분기 토큰당 배당', d.last_dist_per_token != null ? `${Math.round(d.last_dist_per_token).toLocaleString('ko-KR')}원` : '아직 없음', d.last_dist_period ?? undefined, '가장 최근 지급 완료 분기의 토큰당 세전 배당금'],
    ['연 배당수익률', d.annual_dist_yield != null ? `${(d.annual_dist_yield * 100).toFixed(2)}%` : '-', undefined, '최근 확정 4분기 토큰당 배당 합 ÷ 최신 체결가'],
  ];
  return (
    <View>
      <View style={{ marginHorizontal: 20, marginTop: 16, padding: 18, borderRadius: 20, backgroundColor: color.elevatedAlternative, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <CoverImg id={d.work_id} url={cover} title={d.work_title} w={76} h={114} r={12} />
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
          {[
            ['내 보유', d.my_units ? `${d.my_units.toLocaleString('ko-KR')}조각` : '-'],
            ['평균 매입가', d.my_avg_price ? wonText(d.my_avg_price) : '-'],
            ['공모가', wonText(d.unit_price)],
            ['배당 몫', `매출의 ${d.royalty_holder_bps / 100}%`],
          ].map(([k, v]) => (
            <View key={k} style={{ width: '50%' }}>
              <Txt v="label2" w="medium" c={color.labelAssistive}>{k}</Txt>
              <Txt v="headline1" w="bold" c={color.labelStrong} style={{ marginTop: 2 }}>{v}</Txt>
            </View>
          ))}
        </View>
      </View>
      <View style={{ marginHorizontal: 20, marginTop: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <Txt v="body1" w="bold" c={color.labelStrong}>IP 지표 <Txt v="caption1" w="bold" c={PINK}>상장 후</Txt></Txt>
          <Txt v="caption1" w="medium" c={color.labelAssistive}>체결·배당 기준</Txt>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {cells.map(([k, v, tag, desc]) => (
            <View key={k} style={{ width: '48.5%', padding: 12, borderRadius: 14, backgroundColor: color.elevatedAlternative }}>
              <Txt v="caption1" w="semibold" c={color.labelAlternative}>{k}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                <Txt v="headline1" w="bold" c={color.labelStrong}>{v}</Txt>
                {tag ? <Txt v="caption2" w="bold" c={PINK}>{tag}</Txt> : null}
              </View>
              <Txt v="caption2" w="medium" c={color.labelAssistive} style={{ marginTop: 5 }}>{desc}</Txt>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        {[
          ['증권 정보', `발행 ${d.total_units.toLocaleString('ko-KR')}조각`, () => router.push(`/funding/${d.funding_id}`)],
          ['배당금 내역', d.last_dist_period ? `${d.last_dist_period} 토큰당 ${Math.round(d.last_dist_per_token ?? 0)}원` : '첫 배당 전', () => router.push('/dividends')],
          ['공시 · 투자설명서', '', () => router.push(`/funding/${d.funding_id}`)],
        ].map(([k, v, on]) => (
          <Pressable key={k as string} onPress={on as () => void} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 60, borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
            <Txt v="body1" w="semibold" c={color.labelStrong}>{k as string}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Txt v="label1" w="medium" c={color.labelAlternative}>{v as string}</Txt>
              <Icon name="chev" size={18} c={color.labelAlternative} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
