import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Icon, color, radius, shadow, spacing } from '@/ds';

// v2.0 Bottom Navigation: 떠 있는 반투명 캡슐, 아이콘만, 활성은 채움 아이콘. 가운데 = 쇼츠
const TABS: Record<string, { label: string; icon: string; activeIcon: string; center?: boolean }> = {
  index: { label: '홈', icon: 'home', activeIcon: 'homeF' },
  explore: { label: '탐색', icon: 'search', activeIcon: 'searchB' },
  shorts: { label: '쇼츠 보기', icon: 'play', activeIcon: 'play', center: true },
  market: { label: '증권', icon: 'candle', activeIcon: 'candleF' },
  my: { label: 'MY', icon: 'userL', activeIcon: 'userF' },
};

function ShortsGlyph({ c }: { c: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={6.2} y={3.5} width={11.6} height={17} rx={3} stroke={c} strokeWidth={2} />
      <Path d="M10.4 9.3v5.4l4.3-2.7z" fill={c} />
    </Svg>
  );
}

export function FloatingTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, spacing.insetXl) }]}>
      <View style={s.nav} accessibilityRole="tabbar" accessibilityLabel="하단 메뉴">
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const active = state.index === i;
          if (tab.center) {
            return (
              <Pressable
                key={route.key}
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: active }}
                onPress={() => navigateToTab(route.key)}
                style={[s.item, active && s.shortsOn]}>
                <ShortsGlyph c={active ? color.shortsActiveLabel : color.labelNeutral} />
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
              style={s.item}>
              <Icon name={active ? tab.activeIcon : tab.icon} size={24} c={active ? color.labelStrong : color.interactionInactive} />
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
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gapXs,
    paddingHorizontal: spacing.insetS,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: color.lineAlternative,
    ...shadow.large,
  },
  item: { flex: 1, height: 46, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  shortsOn: { backgroundColor: color.shortsActiveFill, borderWidth: 1, borderColor: '#F6BFD0' },
});
