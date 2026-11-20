// 예치금 충전·출금: 금액 입력 → 키움증권으로 이동 → 확인 → 완료 (지갑·MY·증권 탭에 바로 반영)
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { KiwoomSplash } from '@/components/KiwoomSplash';
import { ErrorBox } from '@/components/ui';
import { Button, Chip, DScreen, KV, Keypad, Panel, TopAppBar, Txt, color, spacing } from '@/ds';
import { api, ApiError, type Wallet } from '@/lib/api';
import { showDone } from '@/lib/done';
import { useKiwoomLink } from '@/lib/prefs';
import { useApi } from '@/lib/useApi';
import { nowMs } from '@/lib/now';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function Transfer() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const out = type === 'out';
  const { data: w } = useApi(() => api.get<Wallet>('/wallet'));
  const [link, setLink] = useKiwoomLink();
  const [text, setText] = useState('');
  const [step, setStep] = useState<'amount' | 'splash' | 'confirm'>('amount');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const amount = Number(text || '0');
  const max = out ? (w?.deposit_available ?? 0) : 10_000_000;
  const onKey = (k: string) => setText((t) => (k === 'del' ? t.slice(0, -1) : String(Math.min(max, Number((t + k).replace(/^0+/, '') || '0')))));
  const add = (n: number) => setText((t) => String(Math.min(max, Number(t || '0') + n)));
  const label = out ? '출금' : '충전';
  const account = link.account ?? '5012-****-31';

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      await api.post(out ? '/wallet/deposit/withdrawals' : '/wallet/deposit/charge', { amount });
      if (!link.linked) setLink({ linked: true, account, at: new Date(nowMs()).toISOString().slice(0, 10) });
      const after = await api.get<Wallet>('/wallet');
      showDone({
        pose: out ? 'bow' : 'dibs', tag: 'KIWOOM', title: out ? '출금했어요' : '예치금을 충전했어요',
        sub: `${won(amount)} ${out ? '키움증권 계좌로 보냈어요' : '키움증권 계좌에서 가져왔어요'}`,
        rows: [[out ? '출금 금액' : '충전 금액', won(amount)], ['연결 계좌', `키움증권 ${account}`], ['남은 예치금', won(after.deposit_available)]],
        aLabel: '지갑으로', aHref: '/wallet', bLabel: out ? '홈으로' : '청약하러 가기', bHref: out ? '/' : '/explore',
      });
    } catch (e) { setError(e as ApiError); setStep('amount'); } finally { setBusy(false); }
  };

  if (step === 'splash') {
    return (<><Stack.Screen options={{ headerShown: false }} />
      <KiwoomSplash line1={out ? '내 돈은 내 계좌로' : '투자금 준비도'} line2={out ? '키움으로 출금' : '키움에서 바로'} sub={`키움증권 ${label} 화면으로 이동하고 있어요`} onDone={() => setStep('confirm')} /></>);
  }
  if (step === 'confirm') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <DScreen header={<TopAppBar title={`키움증권 · 예치금 ${label}`} onBack={() => setStep('amount')} />}
          footer={<Button label={busy ? '처리 중…' : `${won(amount)} ${label}하기`} disabled={busy} onPress={confirm} />}>
          <View style={{ backgroundColor: '#14104A', borderRadius: 20, padding: spacing.insetXl, gap: spacing.gapS }}>
            <Txt v="caption1" w="bold" c="#9FB0FF">키움증권 · DIBS 연결 계좌</Txt>
            <Txt v="title2" w="bold" c="#fff" tabular>{won(amount)}</Txt>
            <Txt v="caption1" c="rgba(255,255,255,0.75)">{out ? `DIBS 예치금 → 키움증권 위탁계좌 ${account}` : `키움증권 위탁계좌 ${account} → DIBS 예치금`}</Txt>
          </View>
          <Panel>
            <KV k={`${label} 금액`} v={won(amount)} strong />
            <KV k="수수료" v="0원" />
            <KV k={`${label} 후 예치금`} v={won((w?.deposit_available ?? 0) + (out ? -amount : amount))} />
          </Panel>
          <Txt v="caption1" c={color.labelAlternative}>{out ? '출금한 돈은 키움증권 계좌에서 바로 쓸 수 있어요.' : '충전한 예치금으로 청약하고 조각을 사고팔 수 있어요.'}</Txt>
        </DScreen>
      </>
    );
  }
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DScreen header={<TopAppBar title={`예치금 ${label}`} />}
        footer={<Button label={amount ? `${won(amount)} ${label}하기` : '금액을 입력해 주세요'} disabled={!amount} onPress={() => setStep('splash')} />}>
        <View style={{ alignItems: 'center', gap: spacing.gapS, paddingTop: spacing.insetL }}>
          <Txt v="label1" c={color.labelAlternative}>{out ? `출금 가능 ${won(w?.deposit_available ?? 0)}` : `키움증권 ${account}에서`}</Txt>
          <Txt v="title1" w="bold" c={amount ? color.labelStrong : color.labelAssistive} tabular>{amount ? won(amount) : `얼마나 ${label}할까요?`}</Txt>
          <View style={{ flexDirection: 'row', gap: spacing.gapS, marginTop: spacing.gapS }}>
            {(out ? [] : [[100_000, '+10만'], [500_000, '+50만'], [1_000_000, '+100만']] as [number, string][]).map(([n, l]) => <Chip key={l} label={l} onPress={() => add(n)} />)}
            {out ? <Chip label="전액" onPress={() => setText(String(w?.deposit_available ?? 0))} /> : null}
          </View>
        </View>
        <ErrorBox error={error} />
        <Keypad onKey={onKey} />
      </DScreen>
    </>
  );
}
