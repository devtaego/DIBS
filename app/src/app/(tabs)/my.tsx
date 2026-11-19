import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, DEmpty, Greet, MiniWork, SecH } from '@/components/dibby';
import { Button, KV, Screen, T } from '@/components/ui';
import { api, type Holding, type MySubscription } from '@/lib/api';
import { SUB_STATUS, won } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, radii, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const RISK: Record<string, string> = { STABLE: '안정형', NEUTRAL: '중립형', AGGRESSIVE: '공격형' };
const ROLE: Record<string, string> = { READER: '독자·투자자', CREATOR: '창작자', ADMIN: '운영자' };

// 프로토타입 S.my
export default function My() {
  const { me, logout, baseUrl, refreshMe } = useSession();
  const { data, reload } = useApi(async () => {
    const [holdings, subs] = await Promise.all([api.get<Holding[]>('/me/holdings'), api.get<MySubscription[]>('/me/subscriptions')]);
    return { holdings: holdings.filter((h) => h.units > 0), subs };
  });
  if (!me) return null;

  const units = data?.holdings.reduce((a, h) => a + h.units, 0) ?? 0;
  const full = units > 0 || (data?.subs.length ?? 0) > 0;
  const menu: [string, string, Href, React.ComponentProps<typeof Ionicons>['name']][] = [
    ['지갑', '코인 · 예치금 · 입출금 내역', '/wallet', 'wallet-outline'],
    ['정산 리포트', '분기 배당 내역과 실입금액', '/dividends', 'document-text-outline'],
    ['알림', '배정 결과 · 상장 · 배당 · 만기', '/notifications', 'notifications-outline'],
    ['투자성향', me.risk_level ? RISK[me.risk_level] : '확인 필요', '/risk-profile', 'shield-checkmark-outline'],
  ];

  return (
    <Screen
      onRefresh={async () => {
        await Promise.all([refreshMe(), reload()]);
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <T size={22} weight="700">{me.nickname}</T>
        <Chip label={ROLE[me.role]} tone="pink" />
      </View>
      <T size={13} color={colors.labelAlternative}>{me.email}</T>

      <Greet
        pose={full ? 'puff' : 'hello'}
        title={`볼주머니가 ${full ? '든든해요' : '아직 비어 있어요'}`}
        text={`보유 조각 ${units.toLocaleString('ko-KR')}개 · 청약 ${data?.subs.length ?? 0}건`}
      />

      <SecH
        title="보유 조각"
        right={
          <Pressable onPress={() => router.push('/portfolio')} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T size={13} weight="500" color={colors.labelAlternative}>내 자산</T>
            <Ionicons name="chevron-forward" size={16} color={colors.labelAlternative} />
          </Pressable>
        }
      />
      <View style={s.listCard}>
        {data?.holdings.length ? (
          data.holdings.map((h, i) => (
            <Pressable key={h.funding_id} onPress={() => router.push(`/security/${h.funding_id}`)} style={[s.li, i === data.holdings.length - 1 && { borderBottomWidth: 0 }]}>
              <MiniWork id={h.funding_id} title={h.work_title} line2={`${h.units}조각 · 평가 ${won(h.eval_amount)}`} right={<Ionicons name="chevron-forward" size={20} color={colors.labelAssistive} />} />
            </Pressable>
          ))
        ) : (
          <DEmpty pose="peek" title="아직 조각이 없어요" text="마음에 드는 작품의 조각을 모아 보세요." cta="작품 둘러보기" onPress={() => router.push('/explore')} />
        )}
      </View>

      {data?.subs.length ? (
        <>
          <SecH title="청약 신청" />
          <View style={s.listCard}>
            {data.subs.slice(0, 5).map((sub, i, arr) => (
              <Pressable key={sub.id} onPress={() => router.push(`/funding/${sub.funding_id}`)} style={[s.li, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <MiniWork
                  id={sub.funding_id}
                  title={sub.work_title}
                  line2={sub.allocated_units !== null ? `신청 ${sub.units}조각 → ${sub.allocated_units}조각 배정` : `${sub.units}조각 · ${won(sub.units * sub.unit_price)}`}
                  right={<Chip label={SUB_STATUS[sub.status] ?? sub.status} tone="pink" />}
                />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <SecH title="계정" />
      <View style={s.listCard}>
        <KV k="본인인증" v={me.kyc_verified ? '완료' : '필요'} vColor={me.kyc_verified ? colors.ok : colors.danger} />
        <KV k="증권 계좌" v={me.broker_name ? `${me.broker_name} ${me.broker_account_masked}` : '연결 전 (모의)'} />
      </View>
      <View style={[s.listCard, { marginTop: space(3) }]}>
        {menu.map(([title, sub, href, icon], i) => (
          <Pressable key={title} onPress={() => router.push(href)} style={[s.li, { flexDirection: 'row', alignItems: 'center', gap: space(3) }, i === menu.length - 1 && { borderBottomWidth: 0 }]}>
            <Ionicons name={icon} size={22} color={colors.labelNeutral} />
            <View style={{ flex: 1 }}>
              <T size={14} weight="700">{title}</T>
              <T size={12} color={colors.labelAlternative}>{sub}</T>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.labelAssistive} />
          </Pressable>
        ))}
      </View>

      {me.role === 'ADMIN' ? (
        <Pressable onPress={() => router.push('/admin')} style={[s.listCard, s.admin]}>
          <T size={14} weight="700" color={colors.primary}>시연용 운영자 패널</T>
          <T size={12} color={colors.labelAlternative}>펀딩 마감 · 발행·상장 · 배당 실행을 폰에서</T>
        </Pressable>
      ) : null}

      <T size={12} color={colors.labelAssistive} style={{ marginTop: space(6) }}>서버: {baseUrl}</T>
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

const s = StyleSheet.create({
  listCard: { borderRadius: radii.card, backgroundColor: colors.card, paddingHorizontal: space(4) },
  li: { paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.line },
  admin: { marginTop: space(3), paddingVertical: space(4), borderWidth: 1, borderColor: colors.primary },
});
