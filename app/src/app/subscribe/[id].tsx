import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button, Card, Check, ErrorBox, H2, KV, Loading, MockBadge, Muted, Row, Screen, Stepper, T } from '@/components/ui';
import { api, ApiError, type FundingDetail, type Limits, type Subscription, type Wallet } from '@/lib/api';
import { won } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

export default function SubscribeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const [f, setF] = useState<FundingDetail | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [existing, setExisting] = useState<Subscription | null>(null);
  const [units, setUnits] = useState(10);
  const [tier, setTier] = useState<number | null>(null);
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [agreeNoPrincipal, setAgreeNoPrincipal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [fd, w, l] = await Promise.all([
          api.get<FundingDetail>(`/fundings/${id}`),
          api.get<Wallet>('/wallet'),
          api.get<Limits>(`/fundings/${id}/limits`),
        ]);
        setF(fd);
        setWallet(w);
        setLimits(l);
        try {
          const s = await api.get<Subscription>(`/fundings/${id}/subscriptions/me`);
          if (s.status === 'ACTIVE') {
            setExisting(s);
            setUnits(s.units);
            setTier(s.requested_tier_id);
          }
        } catch {
          /* 청약 없음 */
        }
      } catch (e) {
        setError(e as ApiError);
      }
    })();
  }, [id]);

  if (!me?.risk_level) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center', paddingVertical: space(8) }}>
          <T weight="700">청약 전에 투자성향을 확인해야 해요</T>
          <Muted style={{ marginTop: space(2), textAlign: 'center' }}>검증 전 신작에 투자하는 고위험 상품이라 5문항으로 먼저 확인해요.</Muted>
          <Button title="투자성향 확인하기" onPress={() => router.push('/risk-profile')} style={{ marginTop: space(5), alignSelf: 'stretch' }} />
        </Card>
      </Screen>
    );
  }
  if (!f || !wallet || !limits) return <Screen>{error ? <ErrorBox error={error} /> : <Loading />}</Screen>;

  const amount = units * f.unit_price;
  const delta = existing ? amount - existing.units * f.unit_price : amount;
  const max = Math.min(f.max_units_per_user ?? 9999, 9999);
  const tierObj = f.reward_tiers.find((r) => r.id === tier);
  const canSubmit = agreeRisk && agreeNoPrincipal && units >= 1 && (!tierObj || units >= tierObj.min_units);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const shipping = tierObj?.requires_shipping ? { name: me.nickname, address1: '시연용 배송지' } : undefined;
      if (existing) {
        await api.patch(`/fundings/${id}/subscriptions/me`, { units, reward_tier_id: tier, shipping });
      } else {
        await api.post(`/fundings/${id}/subscriptions`, {
          units, reward_tier_id: tier, shipping, agree_risk_notice: agreeRisk, agree_no_principal_return: agreeNoPrincipal,
        });
      }
      Alert.alert('청약 완료', `${units}조각(${won(amount)})을 청약했어요. 배정은 마감 후 확정돼요.`, [{ text: '확인', onPress: () => router.back() }]);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={20} weight="700" style={{ flex: 1 }}>{f.work_title}</T>
        <MockBadge mode={wallet.mode} />
      </Row>

      <H2>몇 조각 청약할까요?</H2>
      <Card style={{ alignItems: 'center' }}>
        <Stepper value={units} onChange={setUnits} max={max} />
        <Row style={{ gap: space(2), marginTop: space(3) }}>
          {[1, 10, 50, 100].map((n) => (
            <Pressable key={n} onPress={() => setUnits(Math.min(max, n))} style={{ paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: 999, backgroundColor: colors.deepest }}>
              <T size={13}>{n}조각</T>
            </Pressable>
          ))}
        </Row>
        <T size={24} weight="700" color={colors.accent} style={{ marginTop: space(3) }}>{won(amount)}</T>
      </Card>

      <Card>
        <KV k="투자 가능 예치금" v={won(wallet.deposit_available)} vColor={wallet.deposit_available < delta ? colors.danger : colors.text} />
        <KV k="이 종목 남은 한도" v={won(limits.security_remaining)} />
        <KV k="올해 남은 한도" v={won(limits.annual_remaining)} />
        {wallet.deposit_available < delta ? <Button title="예치금 충전하러 가기" kind="ghost" onPress={() => router.push('/wallet')} style={{ marginTop: space(2) }} /> : null}
      </Card>

      {f.reward_tiers.length ? <H2>리워드 (선택)</H2> : null}
      {f.reward_tiers.map((r) => (
        <Card key={r.id} onPress={() => setTier(tier === r.id ? null : r.id)} style={tier === r.id ? { borderWidth: 1.5, borderColor: colors.accent } : undefined}>
          <T weight="700">{r.title}</T>
          <Muted>{r.min_units}조각 이상{r.limited_qty ? ` · 한정 ${r.limited_qty}개` : ''}{r.requires_shipping ? ' · 배송' : ''}</Muted>
          {units < r.min_units ? <Muted size={12}>지금 수량으로는 받을 수 없어요</Muted> : null}
        </Card>
      ))}

      <H2>꼭 확인해 주세요</H2>
      <View>
        <Check checked={agreeRisk} onToggle={() => setAgreeRisk(!agreeRisk)} label="원금 손실이 날 수 있고 예금자 보호 대상이 아니며, 펀딩 성공이 수익을 보장하지 않는다는 점을 확인했어요" />
        <Check checked={agreeNoPrincipal} onToggle={() => setAgreeNoPrincipal(!agreeNoPrincipal)} label="운용 기간 3년이 끝나면 상장폐지되고 원금은 상환되지 않는다는 점을 확인했어요" />
      </View>
      <Muted style={{ marginVertical: space(3) }}>목표를 넘으면 목표의 20%는 고르게, 나머지는 청약 비율대로 배정돼요. 마감 1시간 전부터는 감액·취소할 수 없어요.</Muted>
      <ErrorBox error={error} />
      <Button title={existing ? '수량 변경' : '청약하기'} onPress={submit} disabled={!canSubmit} loading={busy} />
      {existing ? (
        <Button
          title="청약 취소"
          kind="danger"
          style={{ marginTop: space(2) }}
          onPress={async () => {
            try {
              await api.del(`/fundings/${id}/subscriptions/me`);
              router.back();
            } catch (e) {
              setError(e as ApiError);
            }
          }}
        />
      ) : null}
    </Screen>
  );
}
