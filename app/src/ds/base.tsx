import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { color, radius, textStyle, type TextVariant, type TextWeight } from './tokens';

// ── Text ──
export function Txt({ v = 'body2', w = 'regular', c = color.labelNormal, style, lines, children, center, tabular }: {
  v?: TextVariant; w?: TextWeight; c?: string; style?: StyleProp<TextStyle>; lines?: number; children: ReactNode; center?: boolean; tabular?: boolean;
}) {
  return (
    <Text
      numberOfLines={lines}
      style={[textStyle(v, w), { color: c }, center && { textAlign: 'center' }, tabular && { fontVariant: ['tabular-nums'] }, style]}>
      {children}
    </Text>
  );
}

// ── Icon: 디자인 시스템 아이콘 이름 → Ionicons ──
type Ion = React.ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, Ion> = {
  back: 'chevron-back', close: 'close', search: 'search-outline', searchB: 'search', cSearch: 'search-outline',
  bell: 'notifications-outline', cBell: 'notifications-outline', user: 'person-circle-outline', cUser: 'person-circle-outline',
  userL: 'person-outline', userF: 'person', share: 'share-outline', home: 'home-outline', homeF: 'home',
  chart: 'bar-chart-outline', cChart: 'bar-chart-outline', trophy: 'trophy-outline', plus: 'add', plusC: 'add-circle-outline',
  heart: 'heart-outline', heartF: 'heart', book: 'book-outline', bookF: 'book', chev: 'chevron-forward', chevD: 'chevron-down',
  arrow: 'arrow-forward', check: 'checkmark', checkC: 'checkmark-circle', play: 'play', cmt: 'chatbubble-outline',
  coin: 'cash-outline', cCoin: 'cash-outline', bolt: 'flash-outline', clock: 'time-outline', cClock: 'time-outline',
  shield: 'shield-checkmark-outline', cShield: 'shield-checkmark-outline', info: 'information-circle-outline', cInfo: 'information-circle-outline',
  lock: 'lock-closed-outline', eye: 'eye-outline', star: 'star', starL: 'star-outline', send: 'paper-plane-outline',
  bank: 'business-outline', cBank: 'business-outline', truck: 'car-outline', cTruck: 'car-outline', doc: 'document-text-outline', cDoc: 'document-text-outline',
  gear: 'settings-outline', cGear: 'settings-outline', trend: 'trending-up-outline', cTrend: 'trending-up-outline', copy: 'copy-outline',
  down: 'download-outline', refresh: 'refresh', image: 'image-outline', pen: 'create-outline', cPen: 'create-outline',
  vol: 'volume-high-outline', volOff: 'volume-mute-outline', more: 'ellipsis-horizontal', candle: 'stats-chart-outline', candleF: 'stats-chart',
  minus: 'remove', cGift: 'gift-outline', cHelp: 'help-circle-outline', cFund: 'wallet-outline', cUserL: 'person-outline',
};
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 24, c = color.labelStrong }: { name: IconName | string; size?: number; c?: string }) {
  return <Ionicons name={ICONS[name] ?? 'ellipse-outline'} size={size} color={c} />;
}

// ── Icon Button (44×44) ──
export function IconButton({ icon, label, onPress, variant = 'Normal', c = color.labelStrong, dot }: {
  icon: string; label: string; onPress?: () => void; variant?: 'Normal' | 'Background'; c?: string; dot?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        s.ib,
        variant === 'Background' && { backgroundColor: color.elevatedStrong, borderRadius: radius.chip },
        pressed && { backgroundColor: color.fillNormal },
      ]}>
      <Icon name={icon} size={24} c={c} />
      {dot ? <View style={s.dot} /> : null}
    </Pressable>
  );
}

// ── Logo: D · ! · B · S 박스형 (느낌표 칸 = Primary 핑크) ──
export function Logo({ size = 36 }: { size?: number }) {
  const cell = (size - 2) / 2;
  const box = (ch: string, pink?: boolean) => (
    <View style={{ width: cell, height: cell, borderRadius: 3, backgroundColor: pink ? color.primaryNormal : color.labelStrong, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.white, fontFamily: 'Pretendard-Bold', fontSize: cell * 0.62, lineHeight: cell * 0.9 }}>{ch}</Text>
    </View>
  );
  return (
    <View accessibilityLabel="DIBS" style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {box('D')}
      {box('!', true)}
      {box('B')}
      {box('S')}
    </View>
  );
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color.lineAlternative, marginHorizontal: inset }} />;
}

const s = StyleSheet.create({
  ib: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 11, right: 11, width: 6, height: 6, borderRadius: 3, backgroundColor: color.primaryNormal },
});
