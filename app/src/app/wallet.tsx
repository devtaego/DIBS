import { Alert } from 'react-native';

import { Button, Card, ErrorBox, H2, KV, Loading, MockBadge, Muted, Row, Screen, T } from '@/components/ui';
import { api, ApiError, type LedgerLine, type Wallet } from '@/lib/api';
import { dateText, won } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const KIND: Record<string, string> = {
  COIN_CHARGE: '코인 충전', EPISODE_UNLOCK: '회차 구매', DEPOSIT_IN: '예치금 입금', SUBSCRIPTION_LOCK: '청약',
  SUBSCRIPTION_UNLOCK: '청약 감액', FUNDING_ALLOCATION: '배정·환불', FUNDING_FAILED_RELEASE: '펀딩 실패 해제',
  ISSUE_FAILED_REFUND: '발행 실패 환불', TRADE: '체결', ORDER_LOCK: '주문', ORDER_UNLOCK: '주문 해제',
  DIVIDEND_PAYOUT: '배당', CREATOR_PAYOUT: '작가 지급', DISCONTINUE_DISTRIBUTION: '연재 중단 분배',
  WITHDRAWAL_LOCK: '출금 요청', WITHDRAWAL_OUT: '출금', WITHDRAWAL_CANCEL: '출금 취소',
};

export default function WalletScreen() {
  const { data, error, loading, reload } = useApi(async () => {
    const [w, h] = await Promise.all([api.get<Wallet>('/wallet'), api.get<LedgerLine[]>('/wallet/history', { limit: 30 })]);
    return { w, h };
  });

  const act = async (path: string, amount: number, label: string) => {
    try {
      await api.post(path, { amount });
      Alert.alert(label, `${won(amount)} 처리했어요`);
      reload();
    } catch (e) {
      Alert.alert('실패', (e as ApiError).message);
    }
  };

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  const { w, h } = data;
  return (
    <Screen onRefresh={reload}>
      <Card>
        <T weight="700">콘텐츠용 코인</T>
        <T size={26} weight="700">{w.coin.toLocaleString('ko-KR')}코인</T>
        <Muted>유료 회차에만 써요. 예치금으로 바꿀 수 없어요.</Muted>
        <Button title="코인 1,000 충전 (모의 결제)" kind="ghost" onPress={() => act('/wallet/coin/charge', 1000, '코인 충전')} style={{ marginTop: space(3) }} />
      </Card>
      <Card style={{ backgroundColor: colors.cardAlt }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T weight="700">투자용 예치금</T>
          <MockBadge mode={w.mode} />
        </Row>
        <T size={26} weight="700">{won(w.deposit_available)}</T>
        <KV k="청약·주문·출금 대기로 묶인 금액" v={won(w.deposit_locked)} />
        <Muted>실거래에서는 제휴 증권사 계좌에 보관돼요.</Muted>
        <Row style={{ gap: space(2), marginTop: space(3) }}>
          <Button title="100만 원 입금" onPress={() => act('/wallet/deposit/charge', 1_000_000, '예치금 입금')} style={{ flex: 1 }} />
          <Button title="10만 원 출금" kind="ghost" onPress={() => act('/wallet/deposit/withdrawals', 100_000, '출금 요청 (운영자 승인 대기)')} style={{ flex: 1 }} />
        </Row>
      </Card>

      <H2>내역</H2>
      {h.map((l) => (
        <Row key={`${l.journal_id}-${l.account}`} style={{ justifyContent: 'space-between', paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Muted>{dateText(l.created_at)}</Muted>
          <T size={14}>{KIND[l.kind] ?? l.kind}{l.account === 'DEPOSIT_LOCKED' ? ' (묶임)' : l.account === 'COIN' ? ' (코인)' : ''}</T>
          <T size={14} weight="700" color={l.amount > 0 ? colors.up : colors.down}>{l.amount > 0 ? '+' : ''}{l.amount.toLocaleString('ko-KR')}</T>
        </Row>
      ))}
    </Screen>
  );
}
