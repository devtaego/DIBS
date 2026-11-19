import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/lib/session';
import { colors, MODE } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style={MODE === 'light' ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            headerBackButtonDisplayMode: 'minimal',
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="work/[id]" options={{ title: '작품' }} />
          <Stack.Screen name="episode/[id]" options={{ title: '회차 보기' }} />
          <Stack.Screen name="funding/[id]" options={{ title: '펀딩' }} />
          <Stack.Screen name="subscribe/[id]" options={{ title: '조각 청약', presentation: 'modal' }} />
          <Stack.Screen name="risk-profile" options={{ title: '투자성향 확인', presentation: 'modal' }} />
          <Stack.Screen name="security/[id]" options={{ title: '종목' }} />
          <Stack.Screen name="order/[id]" options={{ title: '주문', presentation: 'modal' }} />
          <Stack.Screen name="wallet" options={{ title: '지갑' }} />
          <Stack.Screen name="dividends" options={{ title: '정산 리포트' }} />
          <Stack.Screen name="notifications" options={{ title: '알림' }} />
          <Stack.Screen name="admin" options={{ title: '시연용 운영자 패널' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
