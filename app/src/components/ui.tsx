import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ApiError } from '@/lib/api';
import { colors, radii, radius, space, type as ts } from '@/lib/theme';

export function Screen({ children, onRefresh, edges = ['bottom'] }: { children: ReactNode; onRefresh?: () => Promise<unknown>; edges?: ('top' | 'bottom')[] }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              tintColor={colors.accent}
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await onRefresh();
                setRefreshing(false);
              }}
            />
          ) : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const FONT_BY_WEIGHT: Record<string, string> = { '400': 'Pretendard-Regular', normal: 'Pretendard-Regular', '500': 'Pretendard-Medium', '600': 'Pretendard-SemiBold', '700': 'Pretendard-Bold', bold: 'Pretendard-Bold', '800': 'Pretendard-Bold' };

export function T({ children, style, size = 15, weight = '400', color = colors.text, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle['fontWeight']; color?: string; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: FONT_BY_WEIGHT[String(weight)] ?? 'Pretendard-Regular', fontSize: size, fontWeight: weight, color, lineHeight: Math.round(size * 1.45), letterSpacing: size >= 18 ? -0.02 * size : -0.01 * size }, style]}>
      {children}
    </Text>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => <T size={ts.title3.fontSize} weight="700" style={{ marginBottom: space(2) }}>{children}</T>;
export const H2 = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <View style={[s.row, { marginTop: space(6), marginBottom: space(3), justifyContent: 'space-between' }]}>
    <T size={ts.headline1.fontSize} weight="700">{children}</T>
    {right}
  </View>
);
export const Muted = ({ children, size = 13, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) => (
  <T size={size} color={colors.muted} style={style}>{children}</T>
);

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.75 }, style]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export function KV({ k, v, vColor }: { k: string; v: ReactNode; vColor?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: space(1.5) }}>
      <Muted size={14}>{k}</Muted>
      {typeof v === 'string' || typeof v === 'number' ? <T size={14} weight="600" color={vColor ?? colors.text}>{v}</T> : v}
    </Row>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, loading, style }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  // v2.0: Solid Primary = 연한 핑크 면 + 진한 글자, 버튼은 캡슐형
  const bg = kind === 'primary' ? '#F6A9BF' : 'transparent';
  const fg = kind === 'primary' ? '#5B1A33' : kind === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: kind === 'primary' ? bg : kind === 'danger' ? colors.danger : colors.lineStrong, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <T size={16} weight="700" color={fg}>{title}</T>}
    </Pressable>
  );
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'accent' | 'mock' | 'up' | 'down' | 'danger' }) {
  const c = { default: colors.muted, accent: colors.highlight, mock: colors.highlight, up: colors.up, down: colors.down, danger: colors.danger }[tone];
  const bg = { default: colors.fillNormal, accent: colors.highlightFill, mock: colors.highlightFill, up: colors.riseFill, down: colors.fallFill, danger: colors.riseFill }[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <T size={11} weight="600" color={c}>{label}</T>
    </View>
  );
}

export const MockBadge = (_: { mode?: string }) => null;

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${Math.min(100, Math.max(0, pct))}%` }]} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: space(10), alignItems: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Card style={{ borderColor: colors.danger, borderWidth: 1 }}>
      <T size={14} color={colors.danger} weight="700">{error.code}</T>
      <T size={14}>{error.message}</T>
      {onRetry ? <Button title="다시 시도" kind="ghost" onPress={onRetry} style={{ marginTop: space(3) }} /> : null}
    </Card>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: space(8), alignItems: 'center' }}>
      <Muted size={14}>{text}</Muted>
    </View>
  );
}

export function Segmented<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string }[]; onChange: (k: K) => void }) {
  return (
    <Row style={s.segment}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.segItem, value === o.key && s.segOn]}>
          <T size={14} weight={value === o.key ? '600' : '400'} color={value === o.key ? colors.text : colors.muted}>{o.label}</T>
        </Pressable>
      ))}
    </Row>
  );
}

export function Check({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable onPress={onToggle} style={[s.row, { paddingVertical: space(2), alignItems: 'flex-start' }]}>
      <View style={[s.checkbox, checked && { backgroundColor: colors.button, borderColor: colors.button }]}>
        {checked ? <T size={13} weight="700" color={colors.onPrimary}>✓</T> : null}
      </View>
      <T size={14} style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min = 1, max = 9999, step = 1 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  const btn = (label: string, d: number) => (
    <Pressable onPress={() => onChange(Math.min(max, Math.max(min, value + d)))} style={s.stepBtn}>
      <T size={20} weight="700">{label}</T>
    </Pressable>
  );
  return (
    <Row style={{ gap: space(3) }}>
      {btn('−', -step)}
      <T size={22} weight="700" style={{ minWidth: 64, textAlign: 'center' }}>{value.toLocaleString('ko-KR')}</T>
      {btn('+', step)}
    </Row>
  );
}

export const changeColor = (n: number | null | undefined) => (!n ? colors.muted : n > 0 ? colors.up : colors.down);

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space(5), paddingBottom: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  card: { backgroundColor: colors.card, borderRadius: radii.card, padding: space(4), marginBottom: space(3) },
  button: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, paddingHorizontal: space(4) },
  badge: { borderRadius: radii.tag, paddingHorizontal: space(1.5), paddingVertical: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fillNormal, overflow: 'hidden', marginVertical: space(2) },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.progress },
  segment: { backgroundColor: colors.deepest, borderRadius: radius, padding: 4, gap: 4, marginBottom: space(4) },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: space(2.5), borderRadius: radius - 4 },
  segOn: { backgroundColor: colors.surface, shadowColor: '#191F28', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
});
