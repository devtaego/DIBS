import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// 디자인 BottomNavigation: 홈 · 탐색 · (숏츠 원형 버튼) · 증권 · MY
const TABS: Record<string, { label: string; icon: IconName; activeIcon: IconName; center?: boolean }> = {
  index: { label: '홈', icon: 'home-outline', activeIcon: 'home' },
  explore: { label: '탐색', icon: 'search-outline', activeIcon: 'search' },
  shorts: { label: '숏츠 보기', icon: 'play', activeIcon: 'play', center: true },
  market: { label: '증권', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  my: { label: 'MY', icon: 'person-outline', activeIcon: 'person' },
};

export function FloatingTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={s.nav} accessibilityRole="tabbar">
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const active = state.index === i;
          if (tab.center) {
            return (
              <Pressable key={route.key} accessibilityLabel={tab.label} onPress={() => navigateToTab(route.key)} style={s.item}>
                <View style={s.shorts}>
                  <Ionicons name="play" size={22} color={colors.onShortsBtn} style={{ marginLeft: 2 }} />
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => navigateToTab(route.key)}
              style={[s.item, active && s.itemOn]}>
              <Ionicons name={active ? tab.activeIcon : tab.icon} size={24} color={active ? colors.labelStrong : colors.labelNeutral} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  nav: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: radii.chip,
    backgroundColor: colors.navBg,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#191F28',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  item: { flex: 1, height: 52, borderRadius: radii.chip, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: colors.fillNormal },
  shorts: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.shortsBtn,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EAB0C2',
    shadowOpacity: 0.5,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
