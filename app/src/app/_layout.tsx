import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhoneFrame } from '@/components/PhoneFrame';
import { StackHeader } from '@/components/StackHeader';
import { SessionProvider } from '@/lib/session';
import { colors, MODE } from '@/lib/theme';

export default function RootLayout() {
  // Pretendard (v2.0 글꼴). 웹에서도 동작하도록 런타임 로딩
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.otf'),
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <PhoneFrame>
      <SessionProvider>
        <StatusBar style={MODE === 'light' ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            header: (p) => <StackHeader options={p.options as never} />,
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontFamily: 'Pretendard-SemiBold', fontSize: 16 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            headerBackButtonDisplayMode: 'minimal',
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="otp" options={{ headerShown: false }} />
          <Stack.Screen name="onboard" options={{ headerShown: false }} />
          <Stack.Screen name="seeds" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="intro" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="explore" options={{ headerShown: false }} />
          <Stack.Screen name="shorts" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="market" options={{ headerShown: false }} />
          <Stack.Screen name="work/[id]" options={{ title: '작품' }} />
          <Stack.Screen name="episode/[id]" options={{ title: '회차 보기' }} />
          <Stack.Screen name="funding/[id]" options={{ title: '펀딩' }} />
          <Stack.Screen name="subscribe/[id]" options={{ title: '조각 청약', presentation: 'modal' }} />
          <Stack.Screen name="kiwoom/[id]" options={{ title: '키움증권', presentation: 'modal' }} />
          <Stack.Screen name="risk-profile" options={{ title: '투자성향 확인', presentation: 'modal' }} />
          <Stack.Screen name="profile" options={{ title: '프로필 편집', presentation: 'modal' }} />
          <Stack.Screen name="security/[id]" options={{ title: '종목' }} />
          <Stack.Screen name="order/[id]" options={{ title: '주문', presentation: 'modal' }} />
          <Stack.Screen name="wallet" options={{ title: '지갑' }} />
          <Stack.Screen name="transfer" options={{ title: '예치금' }} />
          <Stack.Screen name="dividends" options={{ title: '정산 리포트' }} />
          <Stack.Screen name="notifications" options={{ title: '알림' }} />
          <Stack.Screen name="admin" options={{ title: '운영자 패널' }} />
          <Stack.Screen name="portfolio" options={{ title: '내 자산' }} />
          <Stack.Screen name="done" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        </Stack>
      </SessionProvider>
      </PhoneFrame>
    </SafeAreaProvider>
  );
}
