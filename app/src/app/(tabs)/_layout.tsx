import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { ready, me } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;

  // 순서 = 하단 탭 순서 (디자인: 홈 · 탐색 · 숏츠 · 증권 · MY)
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 20 },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈', headerShown: false }} />
      <Tabs.Screen name="explore" options={{ title: '탐색', headerShown: false }} />
      <Tabs.Screen name="shorts" options={{ title: '숏츠' }} />
      <Tabs.Screen name="market" options={{ title: '증권' }} />
      <Tabs.Screen name="my" options={{ title: 'MY' }} />
    </Tabs>
  );
}
