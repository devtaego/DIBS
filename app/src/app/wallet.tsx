// 지갑: 예치금(키움증권 연결 계좌)과 코인(웹툰 열람 전용)을 나눠 보여 주고, 충전·출금은 키움 화면으로.
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorBox } from '@/components/ui';
import { Button, DScreen, Panel, Segmented, TopAppBar, Txt, color, spacing } from '@/ds';
import { api, type LedgerLine, type Wallet } from '@/lib/api';
import { useKiwoomLink } from '@/lib/prefs';
import { useApi } from '@/lib/useApi';

const KIND: Record<string, string> = {
  COIN_CHARGE: '코인 충전', EPISODE_UNLOCK: '회차 열람', DEPOSIT_IN: '예치금 충전', SUBSCRIPTION_LOCK: '청약 증거금',
  SUBSCRIPTION_UNLOCK: '청약 변경 환급', FUNDING_ALLOCATION: '배정 · 환불', FUNDING_FAILED_RELEASE: '펀딩 미성립 환불',
  ISSUE_FAILED_REFUND: '발행 실패 환불', TRADE: '조각 체결', ORDER_LOCK: '주문', ORDER_UNLOCK: '주문 취소',
  DIVIDEND_PAYOUT: '분기 정산금', DISCONTINUE_DISTRIBUTION: '연재 중단 분배', WITHDRAWAL_LOCK: '출금 신청', WITHDRAWAL_OUT: '출금',
  WITHDRAWAL_CANCEL: '출금 취소', ATTENDANCE: '출석 코인', PARTNER_POINT: '키움 포인트 전환', PARTNER_COUPON: '키움 계좌 개설 쿠폰',
};
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function WalletScreen() {
  const [tab, setTab] = useState<'deposit' | 'coin'>('deposit');
  const [more, setMore] = useState(false);
  const [link] = useKiwoomLink();
  const { data, error, reload } = useApi(async () => {
    const [w, h] = await Promise.all([api.get<Wallet>('/wallet'), api.get<LedgerLine[]>('/wallet/history', { limit: 30 })]);
    return { w, h };
  });
  const w = data?.w;
  const lines = (data?.h ?? []).filter((l) => (tab === 'coin' ? l.account === 'COIN' : l.account !== 'COIN' && l.account !== 'DEPOSIT_LOCKED'));
  const shown = more ? lines : lines.slice(0, 6);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DScreen header={<TopAppBar title="지갑" />} onRefresh={reload} gap={spacing.gapXl}>
        <ErrorBox error={error} onRetry={reload} />
        <Segmented grow options={[{ key: 'deposit', label: '예치금' }, { key: 'coin', label: '코인' }]} value={tab} onChange={(k) => { setTab(k); setMore(false); }} />
        {w && tab === 'deposit' ? (
          <Panel style={{ gap: spacing.gapM }}>
            <Txt v="caption1" c={color.labelAlternative}>{`키움증권 연결 계좌${link.account ? ` · ${link.account}` : ''}`}</Txt>
            <Txt v="title1" w="bold" c={color.labelStrong} tabular>{won(w.deposit_available)}</Txt>
            {w.deposit_locked ? <Txt v="caption1" c={color.labelAlternative}>{`청약·주문에 묶인 금액 ${won(w.deposit_locked)} (마감·체결 후 정리돼요)`}</Txt> : null}
            <View style={{ flexDirection: 'row', gap: spacing.gapM }}>
              <View style={{ flex: 1 }}><Button label="충전" size="Medium" onPress={() => router.push({ pathname: '/transfer', params: { type: 'in' } })} /></View>
              <View style={{ flex: 1 }}><Button label="출금" size="Medium" variant="Outlined" tone="Assistive" disabled={!w.deposit_available} onPress={() => router.push({ pathname: '/transfer', params: { type: 'out' } })} /></View>
            </View>
          </Panel>
        ) : null}
        {w && tab === 'coin' ? (
          <Panel style={{ gap: spacing.gapM }}>
            <Txt v="caption1" c={color.labelAlternative}>웹툰 · 웹소설 유료 회차 열람 전용</Txt>
            <Txt v="title1" w="bold" c={color.labelStrong} tabular>{`${w.coin.toLocaleString('ko-KR')}코인`}</Txt>
            <View style={{ flexDirection: 'row', gap: spacing.gapM }}>
              <View style={{ flex: 1 }}><Button label="1,000코인 충전" size="Medium" onPress={async () => { await api.post('/wallet/coin/charge', { amount: 1000 }); reload(); }} /></View>
              <View style={{ flex: 1 }}><Button label="키움 포인트로" size="Medium" variant="Outlined" tone="Assistive" onPress={() => router.push('/me/account')} /></View>
            </View>
            <Txt v="caption1" c={color.labelAssistive}>코인은 예치금으로 바꾸거나 투자에 쓸 수 없어요.</Txt>
          </Panel>
        ) : null}

        <View>
          <Txt v="headline2" w="bold" c={color.labelStrong} style={{ marginBottom: spacing.gapS }}>최근 내역</Txt>
          {lines.length === 0 && data ? <Txt v="body2" c={color.labelAlternative}>아직 내역이 없어요</Txt> : null}
          {shown.map((l, i) => (
            <View key={`${l.journal_id}-${l.account}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.insetM, borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="body2" w="medium" c={color.labelStrong}>{KIND[l.kind] ?? l.kind}</Txt>
                <Txt v="caption1" c={color.labelAssistive}>{`${l.created_at.slice(5, 10).replace('-', '.')} ${l.created_at.slice(11, 16)}${l.memo && !['예치금 입금', '코인 충전', '출석 체크'].includes(l.memo) ? ` · ${l.memo}` : ''}`}</Txt>
              </View>
              <Txt v="body2" w="bold" c={l.amount > 0 ? color.primaryNormal : color.labelStrong} tabular>
                {`${l.amount > 0 ? '+' : '−'}${Math.abs(l.amount).toLocaleString('ko-KR')}${l.account === 'COIN' ? '코인' : '원'}`}
              </Txt>
            </View>
          ))}
          {lines.length > 6 ? (
            <Pressable onPress={() => setMore(!more)} style={{ paddingVertical: spacing.insetM, alignItems: 'center' }}>
              <Txt v="label2" w="semibold" c={color.labelAlternative}>{more ? '접기' : `${lines.length - 6}건 더 보기`}</Txt>
            </Pressable>
          ) : null}
        </View>
      </DScreen>
    </>
  );
}
