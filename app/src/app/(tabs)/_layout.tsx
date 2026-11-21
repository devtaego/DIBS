import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Loading } from '@/components/ui';
import { introSeen } from '@/lib/intro';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { ready, me } = useSession();
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    introSeen().then(setSeen);
  }, []);
  if (!ready || seen === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  if (!seen) return <Redirect href="/intro" />; // 첫 실행이면 인트로 4장
  if (!me) return <Redirect href="/login" />;

  // 순서 = 하단 탭 순서 (화면설계도 Screens – MVP v2: 홈 · 펀딩 · 토큰증권 · MY)
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Pretendard-Bold', fontSize: 20 },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈', headerShown: false }} />
      <Tabs.Screen name="funding" options={{ title: '펀딩', headerShown: false }} />
      <Tabs.Screen name="securities" options={{ title: '토큰증권', headerShown: false }} />
      <Tabs.Screen name="my" options={{ title: 'MY', headerShown: false }} />
    </Tabs>
  );
}
