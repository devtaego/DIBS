import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import {
  AgreementRow, Button, Callout, Chip, DScreen, Keypad, KV, PageTitle, Panel, TopAppBar, Txt, color, radius, spacing,
} from '@/ds';
import { api, ApiError, type FundingDetail, type Handoff, type Limits, type PublicConfig, type Subscription, type Wallet } from '@/lib/api';
import { manwon } from '@/lib/cards';
import { showDone } from '@/lib/done';
import { dateText } from '@/lib/format';
import { useSession } from '@/lib/session';
import { DNote, Dibby } from '@/components/dibby';
import { fitsProduct, riskLabel } from '@/lib/risk';
import { useDibbyTask } from '@/lib/useDibbyTask';

// V2 09 펀딩 금액 → V2 05 약관·위험 동의 → V2 10 완료
export default function SubscribeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const task = useDibbyTask();
  const [f, setF] = useState<FundingDetail | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [existing, setExisting] = useState<Subscription | null>(null);
  const [amountText, setAmountText] = useState('100000');
  const [step, setStep] = useState<'amount' | 'terms'>('amount');
  const [tier, setTier] = useState<number | null>(null);
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [agreeTerm, setAgreeTerm] = useState(false);
  const [agreeUnfit, setAgreeUnfit] = useState(false);
  const fit = fitsProduct(me?.risk_level);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [fd, w, l, c] = await Promise.all([
          api.get<FundingDetail>(`/fundings/${id}`), api.get<Wallet>('/wallet'), api.get<Limits>(`/fundings/${id}/limits`), api.get<PublicConfig>('/config/public'),
        ]);
        setF(fd); setWallet(w); setLimits(l); setCfg(c);
        // 다른 펀딩에서 넘어와도 이전 입력이 남지 않게: 기본 10만 원 (1인 한도 안에서)
        setExisting(null); setTier(null);
        setAmountText(String(Math.min(100_000, fd.per_user_cap_units * fd.unit_price)));
        try {
          const s = await api.get<Subscription | null>(`/fundings/${id}/subscriptions/me`);
          if (s?.status === 'ACTIVE') { setExisting(s); setAmountText(String(s.units * fd.unit_price)); setTier(s.requested_tier_id); }
        } catch {
          /* 청약 없음 */
        }
      } catch (e) {
        setError(e as ApiError);
      }
    })();
  }, [id]);

  const header = <TopAppBar type="Sub" title={step === 'amount' ? '펀딩 금액' : '투자 전 확인'} onBack={step === 'terms' ? () => setStep('amount') : undefined} />;

  if (!me?.risk_level) {
    return (
      <DScreen header={header} footer={<Button label="투자성향 확인하기" onPress={() => router.push('/risk-profile')} />}>
        <Stack.Screen options={{ headerShown: false }} />
        <PageTitle title="청약 전에 투자성향을 확인해야 해요" sub="검증 전 작품에 투자하는 매우 높은 위험 상품이라 5문항으로 먼저 확인해요." />
        <View style={{ alignItems: 'center', paddingVertical: spacing.insetL }}>
          <Dibby pose="careful" size={96} />
        </View>
      </DScreen>
    );
  }
  if (!f || !wallet || !limits) {
    return (
      <DScreen header={header}>
        <Stack.Screen options={{ headerShown: false }} />
        {error ? <ErrorBox error={error} /> : <Loading />}
      </DScreen>
    );
  }

  const brokerName = cfg?.broker_name ?? '키움증권';
  const toBroker = async (n?: number) => {
    setError(null);
    try {
      const h = await api.post<Handoff>(`/fundings/${id}/broker-handoff`);
      router.push({ pathname: '/kiwoom/[id]', params: { id: String(id), token: h.token, ...(n ? { units: String(n) } : {}) } });
    } catch (e) {
      setError(e as ApiError);
    }
  };

  // B안: 청약은 증권사 앱에서
  if (cfg?.subscription_channel === 'BROKER') {
    return (
      <DScreen header={header} footer={<Button label={`${brokerName}에서 청약하기`} onPress={() => toBroker()} />}>
        <Stack.Screen options={{ headerShown: false }} />
        <PageTitle title={`청약은 ${brokerName} 앱에서 해요`} sub={f.work_title} />
        <Callout title="DIBS는 계좌번호를 받지 않아요">
          {`계좌 개설·투자성향 확인·청약 대금은 ${brokerName}가 처리해요.${cfg.partner_coupon_coin ? ` 처음 계좌를 열면 씨앗 ${Math.floor(cfg.partner_coupon_coin / 100).toLocaleString('ko-KR')}개를 드려요.` : ''}`}
        </Callout>
        <DNote title="잠깐, 꼭 확인해 주세요" text={`위험 등급 ${f.risk_grade}. 원금을 잃을 수 있고 예금자 보호 대상이 아니에요.`} style={{ marginTop: 0 }} />
        <ErrorBox error={error} />
      </DScreen>
    );
  }

  const unit = f.unit_price;
  const maxAmount = Math.min(f.per_user_cap_units * unit, limits.security_remaining ?? Infinity, limits.annual_remaining);
  const raw = Number(amountText || '0');
  const units = Math.floor(raw / unit);
  const amount = units * unit;
  const delta = existing ? amount - existing.units * unit : amount;
  const over = raw > maxAmount;
  const short = delta > wallet.deposit_available;
  const tierObj = f.reward_tiers.find((r) => r.id === tier);
  const onKey = (k: string) => {
    setError(null);
    // 청약은 조각 단위(1조각 = 공모가 1만 원)라서 키패드 숫자 = 조각 수, 금액은 1만 원 단위로만 만들어진다 (15,300원 같은 금액은 입력 불가)
    setAmountText((t) => {
      const n = Math.floor(Number(t || '0') / unit);
      const next = k === 'del' ? Math.floor(n / 10) : Number(`${n || ''}${k}`.slice(0, 6));
      return String(Math.min(next, Math.floor(maxAmount / unit)) * unit);
    });
  };
  const add = (n: number) => setAmountText((t) => String(Math.floor(Math.min(maxAmount, Number(t || '0') + n) / unit) * unit));

  const submit = async () => {
    if (!(agreeRisk && agreeTerm)) return setError(new ApiError(0, 'CONSENT_REQUIRED', '위험 안내 두 가지를 먼저 확인해 주세요'));
    if (!fit && !agreeUnfit) return setError(new ApiError(0, 'UNFIT_CONFIRM_REQUIRED', '투자성향보다 위험한 상품이라 부적합 확인이 필요해요'));
    if (tierObj && units < tierObj.min_units) return setError(new ApiError(0, 'TIER_MIN_UNITS', `${tierObj.title}은 ${tierObj.min_units}조각부터 받을 수 있어요`));
    setError(null);
    try {
      const shipping = tierObj?.requires_shipping ? { name: me.nickname, address1: '서울시 마포구 월드컵북로 1' } : undefined;
      await task.run('청약을 접수하고 있어요', ['청약 수량을 확인하고 있어요', '한도와 예치금을 확인하고 있어요', '청약 증거금을 맡기고 있어요'], () =>
        existing
          ? api.patch(`/fundings/${id}/subscriptions/me`, { units, reward_tier_id: tier, shipping })
          : api.post(`/fundings/${id}/subscriptions`, { units, reward_tier_id: tier, shipping, agree_risk_notice: agreeRisk, agree_termination_rule: agreeTerm }),
      );
      const eq = (f.terms.allocation_params.equal_ratio_bps ?? 2000) / 100;
      showDone({
        pose: 'dibs',
        tag: 'MOCK SUBSCRIPTION',
        title: existing ? '청약 금액을 바꿨어요' : '펀딩에 참여했어요',
        sub: `${f.work_title}\n${manwon(amount)} · ${units}조각 청약`,
        rows: [
          ['청약 금액', manwon(amount)],
          ['목표 달성 시', `${units.toLocaleString('ko-KR')}조각으로 전환`],
          ['배정 발표', f.close_at ? `${dateText(f.close_at)} 마감 후` : '마감 후'],
        ],
        note: `목표를 넘게 모이면 발행량의 ${eq}%는 고르게, 나머지는 청약 비율대로 배정하고 남은 금액은 바로 돌려드려요.`,
        aLabel: '홈으로', aHref: '/', bLabel: '내 펀딩 보기', bHref: '/portfolio?tab=subs',
      });
    } catch (e) {
      setError(e as ApiError);
    }
  };

  if (step === 'terms') {
    return (
      <DScreen header={header} footer={<Button label={`${manwon(amount)} 키움증권에서 결제하기`} disabled={!(agreeRisk && agreeTerm && (fit || agreeUnfit))} onPress={() => toBroker(units)} />}>
        <Stack.Screen options={{ headerShown: false }} />
        <PageTitle title="투자 전에 확인해 주세요" sub={`${f.work_title} · ${units}조각 · ${manwon(amount)}`} />
        <Panel>
          <AgreementRow strong checked={agreeRisk && agreeTerm && (fit || agreeUnfit)} onToggle={() => { const v = !(agreeRisk && agreeTerm && (fit || agreeUnfit)); setAgreeRisk(v); setAgreeTerm(v); setAgreeUnfit(v); }} label="모두 확인했어요" />
          <View style={{ height: 1, backgroundColor: color.lineAlternative }} />
          <AgreementRow required checked={agreeRisk} onToggle={() => setAgreeRisk(!agreeRisk)} label="원금 손실 가능성·예금자 보호 대상 아님·펀딩 성공이 수익을 보장하지 않는다는 점" />
          <AgreementRow required checked={agreeTerm} onToggle={() => setAgreeTerm(!agreeTerm)} label="만기·원금 상환이 없고, 목표를 넘기면 상장 때 IP토큰(토큰증권)으로 바뀌며 분기 배당과 마켓 매도로만 돌려받는다는 점" />
          {fit ? null : (
            <AgreementRow required checked={agreeUnfit} onToggle={() => setAgreeUnfit(!agreeUnfit)} label={`부적합 확인: 내 투자성향(${riskLabel(me?.risk_level)})보다 위험한 상품(1등급 · 매우 높은 위험)임을 알고 투자해요`} />
          )}
        </Panel>
        {f.reward_tiers.length ? (
          <View style={{ gap: spacing.gapM }}>
            <Txt v="body1" w="bold" c={color.labelStrong}>리워드 (선택)</Txt>
            {f.reward_tiers.map((r) => {
              const on = tier === r.id;
              return (
                <Pressable key={r.id} onPress={() => setTier(on ? null : r.id)} style={{ padding: spacing.insetL, borderRadius: radius.control, borderWidth: on ? 2 : 1, borderColor: on ? color.primaryNormal : color.lineNormal, gap: 2 }}>
                  <Txt v="label1" w="semibold" c={color.labelStrong}>{r.title}</Txt>
                  <Txt v="caption1" c={color.labelAlternative}>{r.min_units}조각부터 · {r.description}</Txt>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <DNote title={`위험 등급 ${f.risk_grade}`} text="목표에 못 미쳐 발행이 실패하면 전액 돌려드려요." style={{ marginTop: 0 }} />
        <Button label="DIBS 예치금으로 청약하기" variant="Text" tone="Assistive" size="Small" onPress={submit} />
        <ErrorBox error={error} />
        {task.overlay}
      </DScreen>
    );
  }

  return (
    <DScreen
      header={header}
      footer={<Button label={units ? (existing ? `${manwon(amount)}으로 바꾸기` : `${manwon(amount)} 펀딩하기`) : '금액을 입력해 주세요'} disabled={!units || over || short} onPress={() => setStep('terms')} />}
      gap={spacing.gapXl}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageTitle title={existing ? '청약 금액을 바꿀까요?' : '얼마나 펀딩할까요?'}
        sub={existing ? `지금 ${manwon(existing.units * unit)} 청약 중 · 마감 1시간 전까지 바꿀 수 있어요` : `${manwon(unit)}(1조각) 단위로만 입력돼요 · 사용 가능 ${manwon(wallet.deposit_available)}`} />
      <View style={{ alignItems: 'center', gap: spacing.gapL, paddingVertical: spacing.inset2xl }}>
        <Txt v="display1" w="bold" c={raw ? color.labelStrong : color.labelDisable} tabular>{raw ? `${raw.toLocaleString('ko-KR')}원` : '0원'}</Txt>
        <View style={{ height: 28, paddingHorizontal: spacing.insetM, borderRadius: radius.chip, borderWidth: 1, borderColor: color.lineNormal, justifyContent: 'center' }}>
          <Txt v="label2" w="semibold" c={over || short ? color.negative : color.labelNormal}>
            {over ? `최대 ${manwon(maxAmount)}까지 펀딩할 수 있어요` : short ? '예치금이 부족해요' : `${units.toLocaleString('ko-KR')}조각`}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.gapM }}>
          <Chip label="+1만" onPress={() => add(10_000)} />
          <Chip label="+5만" onPress={() => add(50_000)} />
          <Chip label="+10만" onPress={() => add(100_000)} />
          <Chip label="최대" onPress={() => setAmountText(String(Math.floor(Math.min(maxAmount, wallet.deposit_available + (existing ? existing.units * unit : 0)) / unit) * unit))} />
        </View>
      </View>
      {short ? <Button label="예치금 충전하러 가기" variant="Outlined" tone="Primary" size="Medium" onPress={() => router.push('/wallet')} /> : null}
      <Keypad onKey={onKey} />
      <KV k="1인 한도" v={`${manwon(f.per_user_cap_units * unit)} (${f.per_user_cap_units}조각)`} />
      <ErrorBox error={error} />
    </DScreen>
  );
}
