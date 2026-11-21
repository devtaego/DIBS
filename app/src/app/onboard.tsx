import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { BigBtn, Icon, SubHeader, Txt, V2Screen, color } from '@/ds';

// 00 온보딩 (Screens – MVP v2): 시작 전에 알아 둘 세 가지 + 위험 고지
const ITEMS = [
  ['search', '펀딩으로 좋은 작품 찾기', '미리보기 3화로 작가의 새 작품을 먼저 만나요'],
  ['coin', '1,000원부터 펀딩', '목표를 넘기면 상장 때 IP토큰(토큰증권)으로 받아요'],
  ['trend', '분기마다 배당금', '작품 순매출의 30%를 조각 수만큼 나눠 받아요'],
] as const;

export default function Onboard() {
  return (
    <V2Screen header={<SubHeader />} pad={24}
      footer={
        <View style={{ gap: 8 }}>
          <BigBtn label="휴대폰으로 시작하기" onPress={() => router.replace('/login')} h={52} />
          <Pressable onPress={() => router.replace('/login')} accessibilityRole="button" style={{ height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="label2" w="semibold" c={color.labelAlternative}>이미 계정이 있나요? 로그인</Txt>
          </Pressable>
        </View>
      }>
      <View style={{ gap: 8, marginTop: 4, marginBottom: 32 }}>
        <Txt v="title3" w="bold" c={color.labelStrong}>{'좋아하는 웹툰,\n뜨기 전에 먼저 찜해요'}</Txt>
        <Txt v="label2" c={color.labelNeutral}>시작하기 전에 세 가지만 알아 두세요.</Txt>
      </View>
      {ITEMS.map(([icon, t, d], i) => (
        <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: i < ITEMS.length - 1 ? 1 : 0, borderBottomColor: color.lineAlternative }}>
          <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: color.fillNormal, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} c={color.labelStrong} /></View>
          <View style={{ flex: 1 }}>
            <Txt v="body1" w="semibold" c={color.labelStrong}>{t}</Txt>
            <Txt v="label2" c={color.labelAlternative}>{d}</Txt>
          </View>
        </View>
      ))}
      <View accessibilityRole="text" style={{ marginTop: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: color.cautionary }}>
        <Icon name="info" size={20} c={color.cautionary} />
        <Txt v="label1" w="bold" c={color.labelStrong}>원금 손실 가능 · 예금자보호 대상 아니에요</Txt>
      </View>
    </V2Screen>
  );
}
