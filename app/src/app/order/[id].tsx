import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CtaBar } from '@/components/dibby';

import { Button, Card, Check, ErrorBox, KV, Muted, Screen, Stepper, T } from '@/components/ui';
import { api, ApiError, type Order, type OrderPreview } from '@/lib/api';
import { ORDER_STATUS, won } from '@/lib/format';
import { useSession } from '@/lib/session';
import { showDone } from '@/lib/done';
import { colors, radii, space } from '@/lib/theme';
import { useDibbyTask } from '@/lib/useDibbyTask';

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
  const task = useDibbyTask();

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
    if (!agree) {
      setError(new ApiError(0, 'CONSENT_REQUIRED', '위험 안내를 먼저 확인해 주세요'));
      return;
    }
    const buy = side === 'BUY';
    try {
      const o = await task.run(buy ? '주문을 보내고 있어요' : '매도 주문을 보내고 있어요', ['주문 가격을 확인하고 있어요', '호가에 주문을 올리고 있어요', '체결 결과를 받아오고 있어요'], () =>
        api.post<Order>('/market/orders', { funding_id: Number(params.id), side, price: Number(price), units, agree_risk_notice: agree }),
      );
      const filled = o.status === 'FILLED';
      const msg = filled ? '바로 체결됐어요' : o.status === 'PARTIAL' ? `일부 체결, ${o.remaining_units}조각은 대기 중이에요` : '같은 가격의 상대 주문을 기다려요';
      showDone({
        pose: filled ? (buy ? 'jump' : 'bow') : 'report',
        tag: buy ? 'MOCK BUY' : 'MOCK SELL',
        title: filled ? (buy ? '조각 챙겼어요!' : '매도 주문 완료') : '주문을 올렸어요',
        sub: `${units}조각 · ${won(Number(price))}에 ${buy ? '매수' : '매도'} 주문했어요.\n${msg}`,
        rows: [
          ['주문 상태', ORDER_STATUS[o.status]],
          ['주문 수량', `${units}조각`],
          ['주문 금액', won(Number(price) * units)],
        ],
        note: filled ? undefined : '미체결 주문은 자정에 자동 취소돼요.',
        aLabel: '종목으로',
        aHref: `/security/${params.id}`,
        bLabel: '내 자산 보기',
        bHref: '/portfolio',
      });
    } catch (e) {
      setError(e as ApiError);
    }
  };

  const buyColor = side === 'BUY' ? colors.rise : colors.fall;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Screen>
      <View style={s.seg}>
        {(['BUY', 'SELL'] as const).map((k) => {
          const on = side === k;
          const c = k === 'BUY' ? colors.rise : colors.fall;
          return (
            <Pressable key={k} onPress={() => setSide(k)} style={[s.segItem, on && { backgroundColor: c }]}>
              <T size={15} weight="700" color={on ? '#FFFFFF' : colors.labelNeutral}>{k === 'BUY' ? '사기' : '팔기'}</T>
            </Pressable>
          );
        })}
      </View>
      <T weight="700">가격 (지정가)</T>
      <View style={s.priceRow}>
        <Pressable accessibilityLabel="가격 내리기" onPress={() => setPrice(String(Math.max(100, Number(price) - 100)))} style={s.tick}>
          <Ionicons name="remove" size={20} color={colors.labelStrong} />
        </Pressable>
        <TextInput
          value={price}
          onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: 22, fontWeight: '700' }}
        />
        <Pressable accessibilityLabel="가격 올리기" onPress={() => setPrice(String(Number(price) + 100))} style={s.tick}>
          <Ionicons name="add" size={20} color={colors.labelStrong} />
        </Pressable>
      </View>
      {preview?.price_band.min ? <Muted style={{ marginTop: space(1) }}>주문 가능 {won(preview.price_band.min)} ~ {won(preview.price_band.max)}</Muted> : null}

      <T weight="700" style={{ marginTop: space(5) }}>수량</T>
      <Card style={{ alignItems: 'center', marginTop: space(2) }}>
        <Stepper value={units} onChange={setUnits} max={side === 'SELL' ? Math.max(1, preview?.available_units ?? 1) : 300} />
      </Card>

      {preview ? (
        <Card>
          <KV k="주문 금액" v={won(preview.gross)} />
          <KV k={`수수료 (${preview.fee_ppm / 10000}%)`} v={won(preview.fee)} />
          <KV k={side === 'BUY' ? '결제 예정액' : '받을 금액'} v={won(preview.total)} vColor={buyColor} />
          <KV k={side === 'BUY' ? '투자 가능 예치금' : '매도 가능 수량'} v={side === 'BUY' ? won(preview.available_deposit) : `${preview.available_units}조각`} />
          <Muted size={12}>거래 수수료 0.015%는 거래소·증권사 몫이에요. 원 미만은 버려요.</Muted>
          {!preview.can_place ? <T color={colors.danger} style={{ marginTop: space(2) }}>{preview.reasons.map((r) => REASON[r] ?? r).join(' · ')}</T> : null}
          {preview.reasons.includes('RISK_PROFILE_REQUIRED') ? <Button title="투자성향 확인하기" kind="ghost" onPress={() => router.push('/risk-profile')} style={{ marginTop: space(2) }} /> : null}
        </Card>
      ) : null}

      <Check checked={agree} onToggle={() => setAgree(!agree)} label="원금 손실이 날 수 있고 예금자 보호 대상이 아니라는 점을 확인했어요" />
      <ErrorBox error={error} />
    </Screen>
    <CtaBar>
      <Button
        title={`${preview ? won(preview.total) + ' ' : ''}${side === 'BUY' ? '사기' : '팔기'} 주문`}
        onPress={place}
        disabled={!preview?.can_place || !me}
        style={{ flex: 1, backgroundColor: buyColor, borderColor: buyColor, opacity: agree ? 1 : 0.55 }}
      />
    </CtaBar>
    {task.overlay}
    </View>
  );
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: colors.bgAlternative, borderRadius: radii.control, padding: 4, gap: 4, marginBottom: space(5) },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: space(3), borderRadius: radii.control - 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgAlternative, borderRadius: radii.control, padding: space(2), marginTop: space(2) },
  tick: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
