import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, Txt } from './base';
import { color, radius, spacing } from './tokens';

// ── Button ──
type BtnProps = {
  label: string; onPress?: () => void; variant?: 'Solid' | 'Outlined' | 'Text'; tone?: 'Primary' | 'Assistive' | 'Inverse';
  size?: 'Large' | 'Medium' | 'Small'; disabled?: boolean; loading?: boolean; icon?: string; fill?: boolean; style?: StyleProp<ViewStyle>;
};
export function Button({ label, onPress, variant = 'Solid', tone = 'Primary', size = 'Large', disabled, loading, icon, fill = true, style }: BtnProps) {
  const h = { Large: 52, Medium: 44, Small: 36 }[size];
  const tv = size === 'Large' ? (['body1', 'bold'] as const) : size === 'Medium' ? (['label1', 'semibold'] as const) : (['label2', 'semibold'] as const);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => {
        let bg = 'transparent', bd = 'transparent';
        if (variant === 'Solid') bg = tone === 'Primary' ? (pressed ? color.primarySoftPressed : color.primarySoft) : tone === 'Inverse' ? color.inverseBackground : pressed ? color.elevatedHeavy : color.elevatedStrong;
        else { bg = pressed ? color.fillNormal : 'transparent'; if (variant === 'Outlined') bd = tone === 'Primary' ? color.primaryNormal : color.lineNeutral; }
        if (disabled) { if (variant === 'Solid') bg = color.interactionDisable; if (variant === 'Outlined') bd = color.lineNormal; }
        return [
          s.btn,
          { height: h, paddingHorizontal: size === 'Small' ? spacing.insetM : spacing.insetL, backgroundColor: bg, borderColor: bd, borderWidth: variant === 'Outlined' ? 1 : 0 },
          fill && variant !== 'Text' ? { alignSelf: 'stretch', width: '100%' } : { alignSelf: 'flex-start' },
          pressed && { transform: [{ scale: 0.97 }] },
          style,
        ];
      }}>
      {(() => {
        let fg: string = color.labelStrong;
        if (variant === 'Solid') fg = tone === 'Primary' ? color.onPrimarySoft : tone === 'Inverse' ? color.inverseLabel : color.labelStrong;
        else if (variant === 'Outlined') fg = tone === 'Primary' ? color.highlight : color.labelStrong;
        else fg = tone === 'Primary' ? color.highlight : color.labelNeutral;
        if (disabled) fg = color.labelDisable;
        if (loading) return <ActivityIndicator color={fg} />;
        return (
          <>
            {icon ? <Icon name={icon} size={size === 'Large' ? 18 : 16} c={fg} /> : null}
            <Txt v={tv[0]} w={tv[1]} c={fg} lines={1}>{label}</Txt>
          </>
        );
      })()}
    </Pressable>
  );
}

// ── Badge ──
export type BadgeType = 'Neutral' | 'Highlight' | 'Recruiting' | 'Closed' | 'Trading' | 'Deadline' | 'Webtoon' | 'Novel' | 'Overlay' | 'Mock';
export function Badge({ label, type = 'Neutral' }: { label: string; type?: BadgeType }) {
  let bg: string = color.fillNormal, fg: string = color.labelNormal, bd = 'transparent', dot: string | null = null;
  if (type === 'Highlight' || type === 'Recruiting') { bg = color.elevatedNormal; bd = color.lineNormal; if (type === 'Recruiting') dot = color.positive; }
  if (type === 'Closed') fg = color.labelAlternative;
  if (type === 'Trading') { bg = 'transparent'; bd = color.lineNeutral; fg = color.labelStrong; dot = color.rise; }
  if (type === 'Deadline') { bg = 'transparent'; bd = color.cautionary; fg = color.cautionary; }
  if (type === 'Webtoon') fg = color.webtoon;
  if (type === 'Novel') fg = color.labelNeutral;
  if (type === 'Overlay') { bg = color.bgTransparent; bd = color.fillAlternative; fg = color.labelStrong; dot = color.positive; }
  if (type === 'Mock') { bg = color.highlightFill; fg = color.highlight; }
  return (
    <View style={[s.badge, { backgroundColor: bg, borderColor: bd }]}>
      {dot ? <View style={[s.badgeDot, { backgroundColor: dot }]} /> : null}
      <Txt v="caption2" w="semibold" c={fg}>{label}</Txt>
    </View>
  );
}

// ── Chip ──
export function Chip({ label, active, onPress, size = 'Medium' }: { label: string; active?: boolean; onPress?: () => void; size?: 'Small' | 'Medium' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[s.chip, { height: size === 'Small' ? 34 : 40 }, active ? { backgroundColor: color.inverseBackground, borderColor: color.inverseBackground } : { borderColor: color.lineNeutral }]}>
      <Txt v="label2" w={active ? 'semibold' : 'medium'} c={active ? color.inverseLabel : color.labelNormal}>{label}</Txt>
    </Pressable>
  );
}

export function ChipRow({ items, value, onChange, size = 'Small' }: { items: string[]; value: string; onChange: (v: string) => void; size?: 'Small' | 'Medium' }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.gapM }} style={{ flexGrow: 0 }}>
      {items.map((it) => <Chip key={it} label={it} size={size} active={it === value} onPress={() => onChange(it)} />)}
    </ScrollView>
  );
}

// ── Segmented ──
export function Segmented<K extends string>({ options, value, onChange, size = 'Medium', grow }: {
  options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; size?: 'Small' | 'Medium'; grow?: boolean;
}) {
  const h = size === 'Small' ? 32 : 44;
  return (
    <View style={[s.seg, { height: h }, grow ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[s.segItem, grow && { flex: 1 }, { paddingHorizontal: size === 'Small' ? spacing.insetM : spacing.insetL }, on && s.segOn]}>
            <Txt v={size === 'Small' ? 'label2' : 'label1'} w={on ? 'semibold' : 'medium'} c={on ? color.labelStrong : color.labelAlternative}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Tab (밑줄) ──
export function Tabs<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.key)} style={[s.tab, on && s.tabOn]}>
            <Txt v="label1" w={on ? 'bold' : 'medium'} c={on ? color.labelStrong : color.labelAlternative}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Linear Progress ──
export function LinearProgress({ value, closed, size = 'Medium' }: { value: number; closed?: boolean; size?: 'Small' | 'Medium' }) {
  const h = size === 'Small' ? 4 : 6;
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height: h, borderRadius: h / 2, backgroundColor: color.fillNormal, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }}>
      <View style={{ width: `${v}%`, height: h, borderRadius: h / 2, backgroundColor: closed ? color.labelAssistive : color.primaryNormal }} />
    </View>
  );
}

// ── Keypad (금액 입력) ──
export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
  return (
    <View style={s.keypad}>
      {keys.map((k) => (
        <Pressable key={k} accessibilityLabel={k === 'del' ? '지우기' : k} onPress={() => onKey(k)} style={({ pressed }) => [s.key, pressed && { backgroundColor: color.fillNormal }]}>
          {k === 'del' ? <Icon name="back" size={24} c={color.labelStrong} /> : <Txt v="heading2" w="semibold" c={color.labelStrong}>{k}</Txt>}
        </Pressable>
      ))}
    </View>
  );
}

// ── Checkbox / Agreement Row ──
export function AgreementRow({ checked, onToggle, label, required, strong }: { checked: boolean; onToggle: () => void; label: string; required?: boolean; strong?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={s.agree}>
      <View style={[s.check, checked && { backgroundColor: color.primaryNormal, borderColor: color.primaryNormal }]}>
        {checked ? <Icon name="check" size={16} c={color.white} /> : null}
      </View>
      <Txt v={strong ? 'body1' : 'label1'} w={strong ? 'bold' : 'medium'} c={color.labelStrong} style={{ flex: 1 }}>
        {required ? <Txt v="label1" w="semibold" c={color.highlight}>(필수) </Txt> : null}
        {label}
      </Txt>
    </Pressable>
  );
}

// ── Toast ──
export function Toast({ text, visible }: { text: string; visible: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [visible, a]);
  return (
    <Animated.View pointerEvents="none" style={[s.toast, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      <Txt v="label1" w="medium" c={color.inverseLabel}>{text}</Txt>
    </Animated.View>
  );
}

export function Callout({ children, tone = 'Neutral', title }: { children: ReactNode; tone?: 'Neutral' | 'Caution' | 'Highlight'; title?: string }) {
  const bg = tone === 'Highlight' ? color.highlightFill : color.bgAlternative;
  const ic = tone === 'Caution' ? color.cautionary : tone === 'Highlight' ? color.highlight : color.labelAlternative;
  return (
    <View style={[s.callout, { backgroundColor: bg }]}>
      <Icon name="info" size={18} c={ic} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Txt v="label2" w="bold" c={color.labelStrong}>{title}</Txt> : null}
        {typeof children === 'string' ? <Txt v="label2" c={color.labelNeutral}>{children}</Txt> : children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { borderRadius: radius.chip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.gapS, minWidth: 44 },
  badge: { height: 24, paddingHorizontal: spacing.insetM, borderRadius: radius.chip, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.gapXs, alignSelf: 'flex-start' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  chip: { paddingHorizontal: spacing.insetL, borderRadius: radius.chip, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', padding: 3, borderRadius: radius.chip, backgroundColor: color.bgAlternative },
  segItem: { borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: color.elevatedNormal, shadowColor: '#191F28', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.lineAlternative },
  tab: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabOn: { borderBottomColor: color.labelStrong },
  keypad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.333%', height: 59, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control },
  agree: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, minHeight: 48 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: color.lineNeutral, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: spacing.screen, right: spacing.screen, bottom: 120, borderRadius: radius.control, backgroundColor: 'rgba(25,31,40,0.92)', paddingVertical: spacing.insetM, paddingHorizontal: spacing.insetL, alignItems: 'center' },
  callout: { flexDirection: 'row', gap: spacing.gapM, padding: spacing.insetM, borderRadius: radius.control, alignItems: 'flex-start' },
});
