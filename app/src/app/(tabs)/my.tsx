import { router } from 'expo-router';

import { Badge, Button, Card, KV, Muted, Row, Screen, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

const RISK: Record<string, string> = { STABLE: '안정형', NEUTRAL: '중립형', AGGRESSIVE: '공격형' };
const ROLE: Record<string, string> = { READER: '독자·투자자', CREATOR: '창작자', ADMIN: '운영자' };

export default function My() {
  const { me, logout, baseUrl, refreshMe } = useSession();
  if (!me) return null;
  return (
    <Screen onRefresh={refreshMe}>
      <Card style={{ backgroundColor: colors.cardAlt }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={20} weight="800">{me.nickname}</T>
          <Badge label={ROLE[me.role]} tone="accent" />
        </Row>
        <Muted>{me.email}</Muted>
        <KV k="본인인증" v={me.kyc_verified ? '완료' : '필요'} vColor={me.kyc_verified ? colors.ok : colors.danger} />
        <KV k="투자성향" v={me.risk_level ? RISK[me.risk_level] : '확인 필요'} vColor={me.risk_level ? colors.text : colors.danger} />
        <KV k="증권 계좌" v={me.broker_name ? `${me.broker_name} ${me.broker_account_masked}` : '연결 전 (모의)'} />
      </Card>

      <Button title={me.risk_level ? '투자성향 다시 확인' : '투자성향 확인하기'} kind="ghost" onPress={() => router.push('/risk-profile')} style={{ marginBottom: space(3) }} />
      <Card onPress={() => router.push('/wallet')}><T weight="700">지갑</T><Muted>코인 · 예치금 · 입출금 내역</Muted></Card>
      <Card onPress={() => router.push('/dividends')}><T weight="700">정산 리포트</T><Muted>분기 배당 내역과 실입금액</Muted></Card>
      <Card onPress={() => router.push('/notifications')}><T weight="700">알림</T><Muted>배정 결과 · 상장 · 배당 · 만기</Muted></Card>
      {me.role === 'ADMIN' ? (
        <Card onPress={() => router.push('/admin')} style={{ borderWidth: 1, borderColor: colors.accent }}>
          <T weight="700" color={colors.accent}>시연용 운영자 패널</T>
          <Muted>펀딩 마감 · 발행·상장 · 배당 실행을 폰에서</Muted>
        </Card>
      ) : null}

      <Muted style={{ marginTop: space(6) }}>서버: {baseUrl}</Muted>
      <Button
        title="로그아웃"
        kind="ghost"
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
        style={{ marginTop: space(3) }}
      />
    </Screen>
  );
}
