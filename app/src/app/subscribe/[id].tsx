import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CtaBar, DNote, Dibby, MiniWork, ModeFlag, Ride } from '@/components/dibby';
import { Button, Check, ErrorBox, KV, Loading, Screen, Stepper, T } from '@/components/ui';
import { api, ApiError, type FundingDetail, type Limits, type Subscription, type Wallet } from '@/lib/api';
import { showDone } from '@/lib/done';
import { dateText, won } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, radii, space, type as ts } from '@/lib/theme';
import { useDibbyTask } from '@/lib/useDibbyTask';

// 프로토타입 S.subscribe
export default function SubscribeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const task = useDibbyTask();
  const [f, setF] = useState<FundingDetail | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [existing, setExisting] = useState<Subscription | null>(null);
  const [units, setUnits] = useState(10);
  const [tier, setTier] = useState<number | null>(null);
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [agreeTerm, setAgreeTerm] = useState(false);
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
        <View style={{ alignItems: 'center', paddingVertical: space(8) }}>
          <Dibby pose="careful" size={96} />
          <T size={17} weight="700" style={{ marginTop: space(4) }}>청약 전에 투자성향을 확인해야 해요</T>
          <T size={13} color={colors.labelAlternative} style={{ marginTop: space(2), textAlign: 'center' }}>검증 전 신작에 투자하는 고위험 상품이라 5문항으로 먼저 확인해요.</T>
          <Button title="투자성향 확인하기" onPress={() => router.push('/risk-profile')} style={{ marginTop: space(6), alignSelf: 'stretch' }} />
        </View>
      </Screen>
    );
  }
  if (!f || !wallet || !limits) return <Screen>{error ? <ErrorBox error={error} /> : <Loading />}</Screen>;

  const amount = units * f.unit_price;
  const delta = existing ? amount - existing.units * f.unit_price : amount;
  const max = f.per_user_cap_units;
  const tierObj = f.reward_tiers.find((r) => r.id === tier);
  const agreed = agreeRisk && agreeTerm;
  const equalPct = (f.terms.allocation_params.equal_ratio_bps ?? 2000) / 100;
  const earlyPct = (f.terms.allocation_params.early_reader_bps ?? 0) / 100;

  const submit = async () => {
    if (!agreed) {
      setError(new ApiError(0, 'CONSENT_REQUIRED', '위험 안내 두 가지를 먼저 확인해 주세요'));
      return;
    }
    if (tierObj && units < tierObj.min_units) {
      setError(new ApiError(0, 'TIER_MIN_UNITS', `${tierObj.title}은 ${tierObj.min_units}조각 이상부터 받을 수 있어요`));
      return;
    }
    setError(null);
    try {
      const shipping = tierObj?.requires_shipping ? { name: me.nickname, address1: '시연용 배송지' } : undefined;
      await task.run('청약을 접수하고 있어요', ['청약 수량을 확인하고 있어요', '한도와 예치금을 확인하고 있어요', '청약 증거금을 맡기고 있어요'], () =>
        existing
          ? api.patch(`/fundings/${id}/subscriptions/me`, { units, reward_tier_id: tier, shipping })
          : api.post(`/fundings/${id}/subscriptions`, { units, reward_tier_id: tier, shipping, agree_risk_notice: agreeRisk, agree_termination_rule: agreeTerm }),
      );
      showDone({
        pose: 'dibs',
        tag: 'MOCK SUBSCRIPTION',
        title: existing ? '청약 수량을 바꿨어요' : '조각을 볼주머니에 쏙!',
        sub: `${f.work_title}\n${units}조각 모의 청약을 접수했어요.`,
        rows: [
          ['청약 수량', `${units.toLocaleString('ko-KR')}조각`],
          ['배정 발표', f.close_at ? `${dateText(f.close_at)} 마감 후` : '마감 후'],
          ['청약 금액', won(amount)],
        ],
        note: `목표를 넘게 모이면 발행량의 ${equalPct}%는 고르게${earlyPct ? `(그중 ${earlyPct}%는 미리 찜하고 완독한 초기 독자 우선)` : ''}, 나머지는 청약 비율대로 배정하고 남은 금액은 돌려드려요.`,
        aLabel: '홈으로',
        aHref: '/',
        bLabel: '내 청약 보기',
        bHref: '/portfolio',
      });
    } catch (e) {
      setError(e as ApiError);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <ModeFlag text="모의 청약 · 실제 거래 없음" />
        <View style={{ marginTop: space(4) }}>
          <MiniWork id={f.work_id} title={f.work_title} line2="플랫폼 매출 수익권 · 개별 작품 토큰증권" />
        </View>

        <View style={s.card}>
          <T size={12} weight="500" color={colors.labelAlternative}>1조각 청약가</T>
          <T size={ts.title3.fontSize + 4} weight="700" style={{ marginTop: 4, marginBottom: space(3) }}>{won(f.unit_price)}</T>
          <View style={s.row}>
            <T size={12} weight="600" color={colors.labelAlternative}>모집 진행률</T>
            <T size={12} weight="600">{f.progress.achievement_pct.toLocaleString('ko-KR')}%</T>
          </View>
          <Ride pct={f.progress.achievement_pct} />
          <View style={[s.row, { marginTop: space(2) }]}>
            <T size={12} weight="500" color={colors.labelAlternative}>{won(f.progress.raised_amount)}</T>
            <T size={12} weight="500" color={colors.labelAlternative}>목표 {won(f.target_amount)}</T>
          </View>
        </View>

        <View style={[s.row, { marginTop: space(6) }]}>
          <T size={ts.headline1.fontSize} weight="700">청약 수량</T>
          <T size={12} weight="500" color={colors.labelAlternative}>1조각부터 · 1인 최대 {max.toLocaleString('ko-KR')}조각</T>
        </View>
        <View style={[s.card, { alignItems: 'center' }]}>
          <Stepper value={units} onChange={setUnits} max={max} />
          <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(3) }}>
            {[1, 10, 50, 100].filter((n) => n <= max).map((n) => (
              <Pressable key={n} onPress={() => setUnits(Math.min(max, n))} style={s.quick}>
                <T size={13} weight="500" color={colors.labelNeutral}>{n}조각</T>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={[s.row, { paddingVertical: space(3) }]}>
          <T size={13} weight="500" color={colors.labelAlternative}>청약 예정금액</T>
          <T size={ts.headline1.fontSize} weight="700">{won(amount)}</T>
        </View>

        <View style={s.card}>
          <KV k="투자 가능 예치금" v={won(wallet.deposit_available)} vColor={wallet.deposit_available < delta ? colors.danger : colors.text} />
          <KV k="이 종목 남은 한도" v={won(limits.security_remaining)} />
          <KV k="올해 남은 한도" v={won(limits.annual_remaining)} />
          {wallet.deposit_available < delta ? <Button title="예치금 충전하러 가기" kind="ghost" onPress={() => router.push('/wallet')} style={{ marginTop: space(2), height: 44 }} /> : null}
        </View>

        {f.reward_tiers.length ? <T size={ts.headline1.fontSize} weight="700" style={{ marginTop: space(6), marginBottom: space(3) }}>리워드 (선택)</T> : null}
        {f.reward_tiers.map((r) => {
          const on = tier === r.id;
          return (
            <Pressable key={r.id} onPress={() => setTier(on ? null : r.id)} style={[s.opt, on && { borderColor: colors.primary, backgroundColor: colors.highlightFill }]}>
              <View style={[s.radio, on && { borderColor: colors.primary, borderWidth: 6 }]} />
              <View style={{ flex: 1 }}>
                <T size={14} weight="700">{r.title}</T>
                <T size={12} color={colors.labelAlternative}>
                  {r.min_units}조각 이상{r.limited_qty ? ` · 한정 ${r.limited_qty}개` : ''}{r.requires_shipping ? ' · 배송' : ''}
                </T>
                {units < r.min_units ? <T size={12} color={colors.danger}>지금 수량으로는 받을 수 없어요</T> : null}
              </View>
            </Pressable>
          );
        })}

        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T size={13} weight="700">받는 권리</T>
            <Ionicons name="information-circle-outline" size={16} color={colors.labelAssistive} />
          </View>
          <T size={12} color={colors.labelAlternative} style={{ marginTop: 6 }}>
            작품 순매출(유료 미리보기·광고·굿즈) 중 원금 회수 전에는 {f.terms.royalty_holder_bps / 100}%, 누적 분배금이 발행액에 닿은 다음 분기부터는 {f.terms.royalty_holder_after_bps / 100}%를 보유 조각 수만큼 나눠 받는 수익 배분권이에요. 분기마다 정산해요. 만기는 없고, 완결 후 3년 또는 매출이 2분기 연속 크게 줄면 권리가 끝나요. 작가는 최근 4분기 분배금의 3배로 전량 매입할 수 있어요.
          </T>
        </View>

        <DNote title="잠깐, 꼭 확인해 주세요" text={`위험등급: ${f.risk_grade}. 원금을 잃을 수 있고 예금자 보호 대상이 아니에요. 발행이 실패하면 전액 돌려드려요.`} />
        <View style={{ marginTop: space(3) }}>
          <Check checked={agreeRisk} onToggle={() => setAgreeRisk(!agreeRisk)} label="원금 손실 가능성·예금자 보호 대상 아님·펀딩 성공이 수익을 보장하지 않는다는 점을 확인했어요" />
          <Check checked={agreeTerm} onToggle={() => setAgreeTerm(!agreeTerm)} label="만기와 원금 상환이 없고, 종료 규칙(완결 후 3년·저매출 2분기 연속)과 작가 매입 옵션이 있다는 점을 확인했어요" />
        </View>
        <T size={12} color={colors.labelAssistive} style={{ marginTop: space(2) }}>마감 1시간 전부터는 감액·취소할 수 없어요.</T>
        <ErrorBox error={error} />
        {existing ? (
          <Button
            title="청약 취소"
            kind="danger"
            style={{ marginTop: space(3) }}
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
      <CtaBar>
        <Button title={`${won(amount)} ${existing ? '수량 변경' : '청약하기'}`} onPress={submit} style={{ flex: 1, opacity: agreed ? 1 : 0.55 }} />
      </CtaBar>
      {task.overlay}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radii.card, backgroundColor: colors.card, padding: space(4), marginTop: space(4) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quick: { paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radii.chip, backgroundColor: colors.fillNormal },
  opt: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start', padding: space(3.5), borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.lineStrong, marginBottom: space(2) },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.labelDisable, marginTop: 1 },
});
