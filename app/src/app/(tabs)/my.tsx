import { router } from 'expo-router';
import { Image, Pressable, View } from 'react-native';

import { ErrorBox } from '@/components/ui';
import { Button, DScreen, GroupLabel, Icon, ListCell, Panel, TopAppBar, Txt, color, radius, spacing } from '@/ds';
import { api, type Holding, type MySubscription, type Wallet, type WorkCard } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { nowMs } from '@/lib/now';
import { useKiwoomLink } from '@/lib/prefs';
import { riskLabel } from '@/lib/risk';
import { avatarSource } from '@/lib/avatar';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';


// V2 13 MY
export default function My() {
  const { me, logout, baseUrl } = useSession();
  const [kiwoom] = useKiwoomLink();
  const { data, error, reload } = useApi(async () => {
    if (!me) return null;
    const [wallet, holdings, subs, dibs] = await Promise.all([
      api.get<Wallet>('/wallet'), api.get<Holding[]>('/me/holdings'), api.get<MySubscription[]>('/me/subscriptions'),
      api.get<WorkCard[]>('/me/dibs').catch(() => [] as WorkCard[]),
    ]);
    return { wallet, holdings, subs, dibs };
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
  const deposit = data?.wallet.deposit_available ?? 0;
  const units = (data?.holdings ?? []).reduce((a, h) => a + h.units, 0);
  const activeAmt = active.reduce((a, x) => a + x.units * x.unit_price, 0);
  const days = me.created_at ? Math.max(1, Math.ceil((nowMs() - new Date(me.created_at).getTime()) / 86_400_000)) : 1;

  return (
    <DScreen header={<TopAppBar type="Main" />} onRefresh={reload} tabBar gap={spacing.gapXl} padTop={spacing.insetS}>
      <ErrorBox error={error} onRetry={reload} />
      {/* 프로필: 디비 얼굴 아바타 + 등급 배지 + 가입 일수 */}
      <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapL }} onPress={() => router.push('/profile')} accessibilityLabel="프로필 편집">
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FDEBF1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={avatarSource(me.avatar_url)} style={{ width: 60, height: 60 }} resizeMode="cover" accessibilityLabel="프로필 디비" />
        </View>
        <View style={{ flex: 1, gap: spacing.gapXs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapS }}>
            <Txt v="headline1" w="bold" c={color.labelStrong}>{me.nickname}</Txt>
            <View style={{ height: 22, paddingHorizontal: spacing.insetS, borderRadius: radius.chip, borderWidth: 1, borderColor: color.lineNormal, justifyContent: 'center' }}>
              <Txt v="caption2" w="bold" c={color.labelNeutral}>{units ? '새싹 투자자' : '예비 투자자'}</Txt>
            </View>
          </View>
          <Txt v="caption1" c={color.labelAlternative}>{`가입 ${days}일째 · ${riskLabel(me.risk_level)}`}</Txt>
        </View>
        <Icon name="chev" size={20} c={color.labelAssistive} />
      </Pressable>

      <View style={{ flexDirection: 'row', paddingVertical: spacing.insetS }}>
        {[
          [`${data?.holdings.length ?? 0}종목`, '보유 조각'],
          [activeAmt ? `${(activeAmt / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만` : '0', '진행 중 펀딩'],
          [`${data?.dibs.length ?? 0}`, '관심 작품'],
        ].map(([v, l], i) => (
          <Pressable key={l} onPress={() => router.push(i === 2 ? '/me/dibs' : '/portfolio')} style={[{ flex: 1, alignItems: 'center', gap: spacing.gap2xs }, i > 0 && { borderLeftWidth: 1, borderLeftColor: color.lineAlternative }]}>
            <Txt v="body1" w="bold" c={color.labelStrong} tabular>{v}</Txt>
            <Txt v="caption1" w="medium" c={color.labelAlternative}>{l}</Txt>
          </Pressable>
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
        <ListCell title="관심 작품" icon="star" trailing="Value" value={`${data?.dibs.length ?? 0}작품`} onPress={() => router.push('/me/dibs')} />
        <ListCell title="투자·거래 내역" icon="doc" onPress={() => router.push('/portfolio')} />
        <ListCell title="정산 리포트" icon="chart" trailing="Badge" badge="분기" onPress={() => router.push('/dividends')} />
        <ListCell title="투자 한도" icon="cFund" onPress={() => router.push('/me/limits')} />
        <ListCell title="서류함" icon="cDoc" onPress={() => router.push('/me/docs')} divider={false} />
      </View>
      <View>
        <GroupLabel>계정 · 설정</GroupLabel>
        <ListCell title="투자성향 확인" trailing="Value" value={me.risk_level ? riskLabel(me.risk_level) : '미확인'} icon="shield" onPress={() => router.push('/risk-profile')} />
        <ListCell title="연결 계좌" icon="bank" trailing="Value" value={kiwoom.linked ? `키움 ${kiwoom.account?.slice(-2) ? '••' + kiwoom.account.slice(-2) : ''}` : '연결하기'} onPress={() => router.push('/me/account')} />
        <ListCell title="알림 설정" icon="bell" onPress={() => router.push('/me/alerts')} divider={me.role === 'ADMIN'} />
        {me.role === 'ADMIN' ? <ListCell title="시연용 운영자 패널" icon="gear" onPress={() => router.push('/admin')} divider={false} /> : null}
      </View>
      <View>
        <GroupLabel>도움</GroupLabel>
        <ListCell title="고객센터 · 자주 묻는 질문" icon="cHelp" onPress={() => router.push('/me/help')} />
        <ListCell title="약관 · 개인정보 처리방침" icon="doc" onPress={() => router.push('/me/terms')} />
        <ListCell title="앱 소개 다시 보기" icon="info" onPress={() => router.push({ pathname: '/intro', params: { replay: '1' } })} divider={false} />
      </View>
      <Txt v="caption2" c={color.labelAssistive}>{DEMO ? '정적 데모 · 시연 데이터로 동작 (실제 저장 없음)' : `서버: ${baseUrl}`}</Txt>
      <Button label="로그아웃" variant="Outlined" tone="Assistive" size="Medium" onPress={async () => { await logout(); router.replace('/login'); }} />
    </DScreen>
  );
}
