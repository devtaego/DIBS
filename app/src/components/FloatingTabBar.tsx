import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, color, radius, shadow, spacing } from '@/ds';

// Screens – MVP v2 · Navigation/Bottom Navigation
// 떠 있는 반투명 캡슐, 4칸(홈 · 펀딩 · 토큰증권 · MY), 아이콘 20 + 글자. 활성 칸은 연분홍 면 + 진분홍 글자
const TABS: Record<string, { label: string; icon: string; activeIcon: string }> = {
  index: { label: '홈', icon: 'home', activeIcon: 'homeF' },
  funding: { label: '펀딩', icon: 'heart', activeIcon: 'heartF' },
  securities: { label: '토큰증권', icon: 'candle', activeIcon: 'candleF' },
  my: { label: 'MY', icon: 'userL', activeIcon: 'userF' },
};

export function FloatingTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, spacing.insetXl) }]}>
      <View style={s.nav} accessibilityRole="tabbar" accessibilityLabel="하단 메뉴">
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const active = state.index === i;
          const c = active ? color.primaryStrong : color.labelNeutral;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => navigateToTab(route.key)}
              style={[s.item, active && s.itemOn]}>
              <Icon name={active ? tab.activeIcon : tab.icon} size={20} c={c} />
              <Text style={[s.label, { color: c }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.insetL },
  nav: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gapXs,
    paddingHorizontal: spacing.insetS,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px) saturate(1.8)' } as object) : null),
    ...shadow.large,
  },
  item: { flex: 1, height: 48, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', gap: 1 },
  itemOn: { backgroundColor: '#FBD9E3', borderWidth: 1, borderColor: '#F6BFD0' },
  label: { fontFamily: 'Pretendard-Bold', fontSize: 11, lineHeight: 13 },
});
