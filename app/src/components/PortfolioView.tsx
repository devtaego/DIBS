import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { useState, type ReactNode } from 'react';

import { Badge, Button, Card, Empty, ErrorBox, KV, Loading, MockBadge, Muted, Row, Screen, Segmented, T, changeColor } from '@/components/ui';
import { api, ApiError, type Holding, type MySubscription, type Order, type Wallet } from '@/lib/api';
import { FUNDING_STATUS, ORDER_STATUS, SUB_STATUS, pct, won } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

type Tab = 'holdings' | 'subs' | 'orders';

// 증권 탭의 '내 자산' 화면 (예전 portfolio 탭)
export function PortfolioView({ header }: { header?: ReactNode }) {
  const [tab, setTab] = useState<Tab>('holdings');
  const { data, error, loading, reload } = useApi(async () => {
    const [wallet, holdings, subs, orders] = await Promise.all([
      api.get<Wallet>('/wallet'),
      api.get<Holding[]>('/me/holdings'),
      api.get<MySubscription[]>('/me/subscriptions'),
      api.get<Order[]>('/me/orders', { open_only: true }),
    ]);
    return { wallet, holdings, subs, orders };
  });

  const cancel = async (id: number) => {
    try {
      await api.del(`/market/orders/${id}`);
      reload();
    } catch (e) {
      Alert.alert('취소 실패', (e as ApiError).message);
    }
  };

  if (loading && !data) return <Screen>{header}<Loading /></Screen>;
  const evalTotal = data?.holdings.reduce((a, h) => a + h.eval_amount, 0) ?? 0;

  return (
    <Screen onRefresh={reload}>
      {header}
      <ErrorBox error={error} onRetry={reload} />
      {data ? (
        <Card style={{ backgroundColor: colors.cardAlt }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>내 조각 평가금액</Muted>
            <MockBadge mode={data.wallet.mode} />
          </Row>
          <T size={28} weight="700">{won(evalTotal)}</T>
          <KV k="투자 가능 예치금" v={won(data.wallet.deposit_available)} />
          <KV k="청약·주문에 묶인 금액" v={won(data.wallet.deposit_locked)} />
          <Row style={{ gap: space(2), marginTop: space(2) }}>
            <Button title="지갑" kind="ghost" style={{ flex: 1 }} onPress={() => router.push('/wallet')} />
            <Button title="정산 리포트" kind="ghost" style={{ flex: 1 }} onPress={() => router.push('/dividends')} />
          </Row>
        </Card>
      ) : null}

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'holdings', label: '보유' },
          { key: 'subs', label: '청약·배정' },
          { key: 'orders', label: '미체결' },
        ]}
      />

      {tab === 'holdings' ? (
        data?.holdings.length ? (
          data.holdings.map((h) => (
            <Card key={h.funding_id} onPress={() => router.push(`/security/${h.funding_id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="700" style={{ flex: 1 }} numberOfLines={1}>{h.work_title}</T>
                <T weight="700" color={changeColor(h.pnl)}>{pct(h.pnl_pct, 2)}</T>
              </Row>
              <Muted>{h.units}조각{h.locked_units ? ` (매도 대기 ${h.locked_units})` : ''} · 평균 {won(h.avg_price)}</Muted>
              <Row style={{ justifyContent: 'space-between', marginTop: space(1) }}>
                <T>{won(h.eval_amount)}</T>
                <T color={changeColor(h.pnl)}>{h.pnl > 0 ? '+' : ''}{won(h.pnl)}</T>
              </Row>
            </Card>
          ))
        ) : (
          <Empty text="보유 조각이 없어요. 펀딩에 참여하거나 마켓에서 사 보세요" />
        )
      ) : null}

      {tab === 'subs' ? (
        data?.subs.length ? (
          data.subs.map((sub) => (
            <Card key={sub.id} onPress={() => router.push(`/funding/${sub.funding_id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="700" style={{ flex: 1 }} numberOfLines={1}>{sub.work_title}</T>
                <Badge label={SUB_STATUS[sub.status] ?? sub.status} tone={sub.status === 'ALLOCATED' ? 'accent' : 'default'} />
              </Row>
              {sub.allocated_units !== null ? (
                <View style={{ marginTop: space(2) }}>
                  <T size={17} weight="700">
                    신청 {sub.units}조각 → <T size={17} weight="700" color={colors.accent}>{sub.allocated_units}조각 배정</T>
                  </T>
                  {sub.units > sub.allocated_units ? <Muted>나머지 {won((sub.units - sub.allocated_units) * sub.unit_price)}은 바로 돌려받았어요</Muted> : null}
                </View>
              ) : (
                <Muted>{sub.units}조각 청약 · {won(sub.units * sub.unit_price)} 묶임 · 마감 후 배정</Muted>
              )}
              {sub.assigned_tier_title || sub.requested_tier_title ? (
                <Muted>
                  리워드: {sub.assigned_tier_title ?? sub.requested_tier_title}
                  {sub.assigned_tier_title && sub.requested_tier_title && sub.assigned_tier_title !== sub.requested_tier_title ? ' (배정이 줄어 변경됨)' : ''}
                  {sub.tracking_no ? ` · 송장 ${sub.tracking_no}` : ''}
                </Muted>
              ) : null}
              <Muted>펀딩 상태: {FUNDING_STATUS[sub.funding_status]}</Muted>
            </Card>
          ))
        ) : (
          <Empty text="청약 내역이 없어요" />
        )
      ) : null}

      {tab === 'orders' ? (
        data?.orders.length ? (
          data.orders.map((o) => (
            <Card key={o.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge label={o.side === 'BUY' ? '매수' : '매도'} tone={o.side === 'BUY' ? 'up' : 'down'} />
                <Muted>{ORDER_STATUS[o.status]}</Muted>
              </Row>
              <T style={{ marginTop: space(2) }}>{won(o.price)} · 남은 {o.remaining_units}/{o.units}조각</T>
              <Button title="주문 취소" kind="danger" onPress={() => cancel(o.id)} style={{ marginTop: space(3), height: 44 }} />
            </Card>
          ))
        ) : (
          <Empty text="대기 중인 주문이 없어요. 미체결 주문은 자정에 자동 취소돼요" />
        )
      ) : null}
    </Screen>
  );
}
