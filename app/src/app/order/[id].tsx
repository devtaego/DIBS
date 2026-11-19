import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, TextInput } from 'react-native';

import { Button, Card, Check, ErrorBox, KV, Muted, Screen, Segmented, Stepper, T } from '@/components/ui';
import { api, ApiError, type Order, type OrderPreview } from '@/lib/api';
import { ORDER_STATUS, won } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

const REASON: Record<string, string> = {
  INSUFFICIENT_BALANCE: '예치금이 부족해요',
  INSUFFICIENT_UNITS: '매도 가능 수량이 부족해요',
  PRICE_OUT_OF_BAND: '가격제한폭(기준가 ±30%) 밖이에요',
  MARKET_MAINTENANCE: '04:00~04:30 점검 중이에요',
  NOT_TRADABLE: '거래할 수 없는 종목이에요',
  SELF_TRADE_FORBIDDEN: '창작자는 자기 작품을 거래할 수 없어요',
  RISK_PROFILE_REQUIRED: '투자성향 확인이 필요해요',
  KYC_REQUIRED: '본인인증이 필요해요',
  ANNUAL_LIMIT_EXCEEDED: '연간 투자 한도를 넘어요',
  SECURITY_LIMIT_EXCEEDED: '종목당 투자 한도를 넘어요',
};

export default function OrderScreen() {
  const params = useLocalSearchParams<{ id: string; side?: 'BUY' | 'SELL'; price?: string }>();
  const { me } = useSession();
  const [side, setSide] = useState<'BUY' | 'SELL'>(params.side ?? 'BUY');
  const [price, setPrice] = useState(params.price ?? '10000');
  const [units, setUnits] = useState(1);
  const [agree, setAgree] = useState(false);
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // 입력이 멈추고 300ms 뒤 서버 규칙으로 수수료·가능 여부 계산
  useEffect(() => {
    const p = Number(price);
    if (!p) return;
    const t = setTimeout(async () => {
      try {
        setPreview(await api.get<OrderPreview>(`/market/securities/${params.id}/order-preview`, { side, price: p, units }));
        setError(null);
      } catch (e) {
        setError(e as ApiError);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [side, price, units, params.id]);

  const place = async () => {
    setBusy(true);
    try {
      const o = await api.post<Order>('/market/orders', { funding_id: Number(params.id), side, price: Number(price), units, agree_risk_notice: agree });
      const msg = o.status === 'FILLED' ? '바로 체결됐어요' : o.status === 'PARTIAL' ? `일부 체결, ${o.remaining_units}조각은 대기 중이에요` : '같은 가격의 상대 주문을 기다려요. 미체결 주문은 자정에 취소돼요';
      Alert.alert(ORDER_STATUS[o.status], msg, [{ text: '확인', onPress: () => router.back() }]);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const buyColor = side === 'BUY' ? colors.up : colors.down;
  return (
    <Screen>
      <Segmented value={side} onChange={setSide} options={[{ key: 'BUY', label: '매수' }, { key: 'SELL', label: '매도' }]} />
      <T weight="700">가격 (지정가)</T>
      <TextInput
        value={price}
        onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        style={{ backgroundColor: colors.deepest, color: colors.text, borderRadius: 12, padding: space(4), fontSize: 22, fontWeight: '700', marginTop: space(2) }}
      />
      {preview?.price_band.min ? <Muted style={{ marginTop: space(1) }}>주문 가능 {won(preview.price_band.min)} ~ {won(preview.price_band.max)}</Muted> : null}

      <T weight="700" style={{ marginTop: space(5) }}>수량</T>
      <Card style={{ alignItems: 'center', marginTop: space(2) }}>
        <Stepper value={units} onChange={setUnits} max={side === 'SELL' ? Math.max(1, preview?.available_units ?? 1) : 300} />
      </Card>

      {preview ? (
        <Card>
          <KV k="주문 금액" v={won(preview.gross)} />
          <KV k={`수수료 (${preview.fee_bps / 100}%)`} v={won(preview.fee)} />
          <KV k={side === 'BUY' ? '결제 예정액' : '받을 금액'} v={won(preview.total)} vColor={buyColor} />
          <KV k={side === 'BUY' ? '투자 가능 예치금' : '매도 가능 수량'} v={side === 'BUY' ? won(preview.available_deposit) : `${preview.available_units}조각`} />
          {side === 'BUY' ? <Muted size={12}>5조각 이상 사면 매수 수수료가 0.8%로 내려가요. 수수료의 20%는 이 종목 배당 재원으로 쌓여요.</Muted> : null}
          {!preview.can_place ? <T color={colors.danger} style={{ marginTop: space(2) }}>{preview.reasons.map((r) => REASON[r] ?? r).join(' · ')}</T> : null}
          {preview.reasons.includes('RISK_PROFILE_REQUIRED') ? <Button title="투자성향 확인하기" kind="ghost" onPress={() => router.push('/risk-profile')} style={{ marginTop: space(2) }} /> : null}
        </Card>
      ) : null}

      <Check checked={agree} onToggle={() => setAgree(!agree)} label="원금 손실이 날 수 있고 예금자 보호 대상이 아니라는 점을 확인했어요" />
      <ErrorBox error={error} />
      <Button
        title={`${side === 'BUY' ? '매수' : '매도'} 주문`}
        onPress={place}
        disabled={!agree || !preview?.can_place || !me}
        loading={busy}
        style={{ marginTop: space(3), backgroundColor: buyColor, borderColor: buyColor }}
      />
    </Screen>
  );
}
