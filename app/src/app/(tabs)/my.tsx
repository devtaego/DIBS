import { router } from 'expo-router';
import { View } from 'react-native';

import { ErrorBox } from '@/components/ui';
import { Button, DScreen, GroupLabel, Icon, ListCell, Panel, TopAppBar, Txt, color, radius, spacing } from '@/ds';
import { api, type Holding, type MySubscription, type Wallet } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

const RISK: Record<string, string> = { STABLE: '안정형', NEUTRAL: '위험중립형', ACTIVE: '적극투자형', AGGRESSIVE: '공격투자형' };

// V2 13 MY
export default function My() {
  const { me, logout, baseUrl } = useSession();
  const { data, error, reload } = useApi(async () => {
    if (!me) return null;
    const [wallet, holdings, subs] = await Promise.all([
      api.get<Wallet>('/wallet'), api.get<Holding[]>('/me/holdings'), api.get<MySubscription[]>('/me/subscriptions'),
    ]);
    return { wallet, holdings, subs };
  }, [me?.id]);

  if (!me) {
    return (
      <DScreen header={<TopAppBar type="Main" />} tabBar>
        <Panel>
          <Txt v="headline1" w="bold" c={color.labelStrong}>로그인하고 내 조각을 모아 보세요</Txt>
          <Button label="로그인" onPress={() => router.push('/login')} />
        </Panel>
      </DScreen>
    );
  }

  const active = (data?.subs ?? []).filter((x) => x.status === 'ACTIVE');
  const activeAmt = active.reduce((a, x) => a + x.units * x.unit_price, 0);
  const deposit = data?.wallet.deposit_available ?? 0;

  return (
    <DScreen header={<TopAppBar type="Main" />} onRefresh={reload} tabBar gap={spacing.gapXl} padTop={spacing.insetS}>
      <ErrorBox error={error} onRetry={reload} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapL }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FDEBF1', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F6D3DF' }}>
          <Txt v="headline1" w="bold" c={color.highlight}>{me.nickname.slice(0, 1)}</Txt>
        </View>
        <View style={{ flex: 1, gap: spacing.gapXs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapS }}>
            <Txt v="headline1" w="bold" c={color.labelStrong}>{me.nickname}</Txt>
            <View style={{ height: 20, paddingHorizontal: spacing.insetS, borderRadius: radius.chip, borderWidth: 1, borderColor: color.lineNormal, justifyContent: 'center' }}>
              <Txt v="caption2" w="bold" c={color.labelNeutral}>{me.risk_level ? RISK[me.risk_level] ?? me.risk_level : '투자성향 미확인'}</Txt>
            </View>
          </View>
          <Txt v="caption1" c={color.labelAlternative}>{me.email}</Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', paddingVertical: spacing.insetM }}>
        {[
          [`${data?.holdings.length ?? 0}종목`, '보유 조각'],
          [activeAmt ? `${(activeAmt / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만` : '0', '진행 중 펀딩'],
          [`${active.length}건`, '청약 신청'],
        ].map(([v, l], i) => (
          <View key={l} style={[{ flex: 1, alignItems: 'center', gap: spacing.gap2xs }, i > 0 && { borderLeftWidth: 1, borderLeftColor: color.lineAlternative }]}>
            <Txt v="body1" w="bold" c={color.labelStrong}>{v}</Txt>
            <Txt v="caption1" w="medium" c={color.labelAlternative}>{l}</Txt>
          </View>
        ))}
      </View>

      <Panel style={{ borderColor: color.lineNormal }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapS }}>
          <Icon name="cCoin" size={20} />
          <Txt v="label2" w="semibold" c={color.labelStrong}>예치금</Txt>
          <Txt v="caption1" w="medium" c={color.labelAlternative}>{data?.wallet.mode === 'MOCK' ? '모의 계좌' : '연결 계좌'}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Txt v="title2" w="bold" c={color.labelStrong} tabular>{deposit.toLocaleString('ko-KR')}원</Txt>
          <View style={{ flexDirection: 'row', gap: spacing.gapS }}>
            <Button label="출금" tone="Assistive" size="Small" fill={false} onPress={() => router.push('/wallet')} />
            <Button label="충전" tone="Inverse" size="Small" fill={false} onPress={() => router.push('/wallet')} />
          </View>
        </View>
      </Panel>

      <View>
        <GroupLabel>투자</GroupLabel>
        <ListCell title="내 펀딩" icon="heart" trailing="Value" value={`${active.length}건 진행 중`} onPress={() => router.push('/portfolio')} />
        <ListCell title="투자·거래 내역" icon="doc" onPress={() => router.push('/portfolio')} />
        <ListCell title="정산 리포트" icon="chart" trailing="Badge" badge="분기" onPress={() => router.push('/dividends')} divider={false} />
      </View>
      <View>
        <GroupLabel>혜택 · 도움</GroupLabel>
        <ListCell title="투자성향 다시 확인" icon="shield" onPress={() => router.push('/risk-profile')} />
        <ListCell title="알림" icon="bell" onPress={() => router.push('/notifications')} />
        {me.role === 'ADMIN' ? <ListCell title="시연용 운영자 패널" icon="gear" onPress={() => router.push('/admin')} divider={false} /> : null}
      </View>
      <Txt v="caption2" c={color.labelAssistive}>{DEMO ? '정적 데모 · 시연 데이터로 동작 (실제 저장 없음)' : `서버: ${baseUrl}`}</Txt>
      <Button label="로그아웃" variant="Outlined" tone="Assistive" size="Medium" onPress={async () => { await logout(); router.replace('/login'); }} />
    </DScreen>
  );
}
