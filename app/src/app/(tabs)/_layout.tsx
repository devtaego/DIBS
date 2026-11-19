import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';

import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />;

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

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
        tabBarStyle: { backgroundColor: colors.deepest, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈', headerTitle: 'DIBS', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="shorts" options={{ title: '숏츠', tabBarIcon: icon('play-circle') }} />
      <Tabs.Screen name="market" options={{ title: '조각 마켓', tabBarIcon: icon('trending-up') }} />
      <Tabs.Screen name="portfolio" options={{ title: '내 증권', tabBarIcon: icon('pie-chart') }} />
      <Tabs.Screen name="my" options={{ title: 'MY', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
