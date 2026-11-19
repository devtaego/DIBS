import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AreaChart } from '@/components/charts';
import { Chip, CtaBar, MiniWork } from '@/components/dibby';

import { Badge, Button, Card, ErrorBox, H2, KV, Loading, Muted, Row, Screen, T, changeColor } from '@/components/ui';
import { api, type Candle, type OrderBook, type SecurityDetail, type Trade } from '@/lib/api';
import { FUNDING_STATUS, dateText, pct, won } from '@/lib/format';
import { colors, radii, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function SecurityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(
    async () => {
      const [d, book, trades, chart] = await Promise.all([
        api.get<SecurityDetail>(`/market/securities/${id}`),
        api.get<OrderBook>(`/market/securities/${id}/orderbook`),
        api.get<Trade[]>(`/market/securities/${id}/trades`, { limit: 10 }),
        api.get<Candle[]>(`/market/securities/${id}/chart`, { days: 30 }),
      ]);
      return { d, book, trades, chart };
    },
    [id],
    5_000, // 호가·체결 5초마다 갱신 (WebSocket 은 다음 단계)
  );

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  const { d, book, trades, chart } = data;
  const tradable = d.status === 'LISTED';
  const go = (side: 'BUY' | 'SELL', price?: number) => router.push({ pathname: '/order/[id]', params: { id: String(d.funding_id), side, price: String(price ?? d.last_price ?? d.unit_price) } });

  const closes = chart.map((c) => c.close);
  const up = (d.change_pct ?? 0) >= 0;
  const diff = d.last_price !== null && d.reference_price !== null ? d.last_price - d.reference_price : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Screen onRefresh={reload}>
      <MiniWork id={d.work_id} title={d.work_title} line2={`${d.security_code ?? '발행 전'} · 플랫폼 매출 수익권`} right={<Chip label="모의" tone="pink" />} />
      {!tradable ? <View style={{ marginTop: space(3) }}><Badge label={FUNDING_STATUS[d.status]} tone="danger" /></View> : null}
      <T size={32} weight="700" style={{ marginTop: space(4) }}>{won(d.last_price)}</T>
      <T size={14} weight="600" color={changeColor(d.change_pct)}>
        {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}원 ` : ''}({pct(d.change_pct, 2)}) · 기준가 대비
      </T>

      <View style={[s.card, { padding: space(3) }]}>
        {closes.length >= 2 ? <AreaChart values={closes} up={up} /> : <Muted style={{ padding: space(4) }}>아직 체결이 없어요</Muted>}
        {chart.length ? (
          <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
            <Muted size={11}>{chart[0].date.slice(5).replace('-', '.')}</Muted>
            <Muted size={11}>일봉 종가</Muted>
            <Muted size={11}>{chart[chart.length - 1].date.slice(5).replace('-', '.')}</Muted>
          </Row>
        ) : null}
      </View>

      <View style={s.card}>
        <KV k="내 보유" v={`${d.my_units ?? 0}조각${d.my_units ? ` · 평균 ${won(d.my_avg_price)}` : ''}`} />
        <KV k="주문 가능 가격" v={`${won(d.price_band.min)} ~ ${won(d.price_band.max)}`} />
        <KV k="거래 방식" v="지정가 · 모의" />
      </View>
      {!tradable ? (
        <Muted style={{ marginTop: space(3) }}>{d.status === 'MATURED' ? '운용 기간이 끝나 상장폐지된 종목이에요. 원금 상환은 없어요.' : '거래가 정지된 종목이에요.'}</Muted>
      ) : null}

      <H2 right={<Muted size={12}>같은 가격끼리만 체결 · 줄을 누르면 그 가격으로 주문</Muted>}>호가</H2>
      <Card>
        {[...book.asks].reverse().map((l) => (
          <Pressable key={`a${l.price}`} onPress={() => tradable && go('BUY', l.price)}>
            <Row style={{ justifyContent: 'space-between', paddingVertical: space(1.5) }}>
              <Muted>매도 {l.orders}건</Muted>
              <T weight="700" color={colors.down}>{won(l.price)}</T>
              <T>{l.units}조각</T>
            </Row>
          </Pressable>
        ))}
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space(1) }} />
        {book.bids.map((l) => (
          <Pressable key={`b${l.price}`} onPress={() => tradable && go('SELL', l.price)}>
            <Row style={{ justifyContent: 'space-between', paddingVertical: space(1.5) }}>
              <Muted>매수 {l.orders}건</Muted>
              <T weight="700" color={colors.up}>{won(l.price)}</T>
              <T>{l.units}조각</T>
            </Row>
          </Pressable>
        ))}
        {!book.asks.length && !book.bids.length ? <Muted>대기 중인 주문이 없어요</Muted> : null}
      </Card>

      <H2>종목 정보</H2>
      <Card>
        <KV k="공모가" v={won(d.unit_price)} />
        <KV k="발행 조각" v={`${d.total_units.toLocaleString('ko-KR')}조각`} />
        <KV k="최근 7일 거래량" v={`${d.volume_7d}조각 · ${d.trades_7d}건`} vColor={d.volume_7d < 10 ? colors.danger : colors.text} />
        <KV k="최근 4분기 주당 배당" v={won(d.dividend_4q_per_unit)} />
        <KV k="배당 대비 가격" v={d.price_to_dividend ? `${d.price_to_dividend}배` : '배당 전'} />
        <KV k="만기 (상장폐지)" v={dateText(d.maturity_date)} />
        {d.volume_7d < 10 ? <Muted style={{ marginTop: space(1) }}>거래량이 적어 원하는 때 팔지 못할 수 있어요.</Muted> : null}
      </Card>

      <H2>최근 체결</H2>
      <Card>
        {trades.length ? (
          trades.map((t) => (
            <Row key={t.id} style={{ justifyContent: 'space-between', paddingVertical: space(1) }}>
              <Muted>{dateText(t.created_at)}</Muted>
              <T>{won(t.price)}</T>
              <T>{t.units}조각</T>
            </Row>
          ))
        ) : (
          <Muted>아직 체결이 없어요</Muted>
        )}
      </Card>
    </Screen>
    {tradable ? (
      <CtaBar>
        <Button title="팔기" kind="ghost" onPress={() => go('SELL')} style={{ flex: 1, borderColor: colors.fall }} />
        <Button title="사기" onPress={() => go('BUY')} style={{ flex: 1, backgroundColor: colors.rise, borderColor: colors.rise }} />
      </CtaBar>
    ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radii.card, backgroundColor: colors.card, padding: space(4), marginTop: space(4) },
});
