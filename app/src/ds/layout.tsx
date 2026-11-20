import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, IconButton, Logo, Txt } from './base';
import { Badge } from './controls';
import { color, radius, spacing } from './tokens';

// ── Screen: 상단 바 + 스크롤 본문 (+ 하단 고정 버튼) ──
export function DScreen({ header, children, footer, onRefresh, tabBar, gap = spacing.section, padTop = spacing.insetXs, bg = color.bgNormal }: {
  header?: ReactNode; children: ReactNode; footer?: ReactNode; onRefresh?: () => Promise<unknown>; tabBar?: boolean; gap?: number; padTop?: number; bg?: string;
}) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={footer ? ['top', 'bottom'] : ['top']}>
      {/* 휴대폰에서는 상태바 바로 밑에 붙어 답답하지 않게 여백을 조금 둔다 */}
      {header ? <View style={{ paddingTop: Platform.OS === 'web' ? 6 : 14 }}>{header}</View> : null}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: padTop, paddingBottom: tabBar ? 120 : spacing.inset2xl, gap }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              tintColor={color.primaryNormal}
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
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

// ── Top App Bar ──
export function TopAppBar({ type = 'Sub', title, actions = [], onBack }: {
  type?: 'Main' | 'Sub' | 'Modal'; title?: string; actions?: { icon: string; label: string; onPress?: () => void; dot?: boolean }[]; onBack?: () => void;
}) {
  const main = type === 'Main';
  const acts = main && !actions.length
    ? [
        { icon: 'cSearch', label: '검색', onPress: () => router.push({ pathname: '/explore', params: { search: '1' } }) },
        { icon: 'cBell', label: '알림', onPress: () => router.push('/notifications') },
      ]
    : actions;
  return (
    <View style={[s.bar, { paddingLeft: main || type === 'Modal' ? spacing.screen : spacing.insetXs }]}>
      {type === 'Sub' ? <IconButton icon="back" label="뒤로" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} /> : null}
      {main ? (
        <View style={{ flex: 1, height: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
          <Pressable onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel="홈으로" hitSlop={8}>
            <Logo size={30} />
          </Pressable>
        </View>
      ) : (
        <Txt v="body1" w="semibold" c={color.labelStrong} lines={1} style={{ flex: 1 }}>{title}</Txt>
      )}
      {acts.map((a) => <IconButton key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} dot={'dot' in a ? a.dot : undefined} />)}
      {type === 'Modal' ? <IconButton icon="close" label="닫기" onPress={onBack ?? (() => router.back())} /> : null}
    </View>
  );
}

// ── Page title (화면 제목 h1 + 설명) ──
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: spacing.gapXs }}>
      <Txt v="title3" w="bold" c={color.labelStrong}>{title}</Txt>
      {sub ? <Txt v="label2" c={color.labelAlternative}>{sub}</Txt> : null}
    </View>
  );
}

// ── Section Header ──
export function SectionHeader({ title, size = 'Large', link, onPress, count }: { title: string; size?: 'Large' | 'Medium'; link?: string; onPress?: () => void; count?: string }) {
  return (
    <View style={s.sh}>
      <Txt v={size === 'Large' ? 'headline1' : 'body1'} w="bold" c={color.labelStrong}>{title}</Txt>
      {link ? (
        <Pressable onPress={onPress} accessibilityRole="link" style={s.shLink}>
          <Txt v="label2" w="medium" c={color.labelAlternative}>{link}</Txt>
          <Icon name="chev" size={16} c={color.labelAlternative} />
        </Pressable>
      ) : null}
      {count ? <Txt v="caption1" c={color.labelAlternative}>{count}</Txt> : null}
    </View>
  );
}

export function Section({ title, link, onLink, count, children, gap = spacing.gapS, size }: { title: string; link?: string; onLink?: () => void; count?: string; children: ReactNode; gap?: number; size?: 'Large' | 'Medium' }) {
  return (
    <View style={{ gap }}>
      <SectionHeader title={title} link={link} onPress={onLink} count={count} size={size} />
      {children}
    </View>
  );
}

// ── List Cell ──
export function ListCell({ title, sub, icon, trailing = 'Chevron', value, badge, onPress, divider = true, valueColor }: {
  title: string; sub?: string; icon?: string; trailing?: 'Chevron' | 'Value' | 'Badge' | 'None'; value?: string; badge?: string; onPress?: () => void; divider?: boolean; valueColor?: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.cell, divider && s.cellDiv, pressed && { opacity: 0.6 }]}>
      {icon ? <Icon name={icon} size={22} c={color.labelNeutral} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="body2" w="medium" c={color.labelStrong} lines={1}>{title}</Txt>
        {sub ? <Txt v="caption1" c={color.labelAlternative} lines={1}>{sub}</Txt> : null}
      </View>
      {trailing === 'Value' && value ? <Txt v="label1" w="semibold" c={valueColor ?? color.labelNeutral}>{value}</Txt> : null}
      {trailing === 'Badge' && badge ? <View style={{ alignSelf: 'center' }}><Badge label={badge} type="Highlight" /></View> : null}
      {trailing !== 'None' && onPress ? <Icon name="chev" size={18} c={color.labelAssistive} /> : null}
    </Pressable>
  );
}

export function GroupLabel({ children }: { children: string }) {
  return <Txt v="caption1" w="semibold" c={color.labelAssistive} style={{ marginBottom: 2 }}>{children}</Txt>;
}

// ── Stat ──
export function Stat({ label, value, emphasis, align = 'left' }: { label: string; value: string; emphasis?: 'Normal' | 'Highlight' | 'Rise' | 'Fall'; align?: 'left' | 'center' }) {
  const c = emphasis === 'Highlight' ? color.highlight : emphasis === 'Rise' ? color.rise : emphasis === 'Fall' ? color.fall : color.labelStrong;
  return (
    <View style={{ gap: 2, flex: 1, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <Txt v="caption1" c={color.labelAlternative}>{label}</Txt>
      <Txt v="label1" w="bold" c={c} lines={1} tabular>{value}</Txt>
    </View>
  );
}

export function StatGrid({ items, top = true }: { items: { label: string; value: string; emphasis?: 'Normal' | 'Highlight' | 'Rise' | 'Fall' }[]; top?: boolean }) {
  return (
    <View style={[{ flexDirection: 'row', gap: spacing.gapL }, top && { paddingTop: spacing.insetM, borderTopWidth: 1, borderTopColor: color.lineNormal }]}>
      {items.map((i) => <Stat key={i.label} {...i} />)}
    </View>
  );
}

// ── Disclosure Bar (규제 고지 줄) ──
export function DisclosureBar({ text = '원금 손실 가능 · 예금자 보호 대상 아님', onPress }: { text?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.disc}>
      <Icon name="info" size={16} c={color.labelAlternative} />
      <Txt v="caption1" c={color.labelAlternative} style={{ flex: 1 }}>{text}</Txt>
      {onPress ? <Icon name="chev" size={16} c={color.labelAssistive} /> : null}
    </Pressable>
  );
}

// ── Card 면 ──
export function Panel({ children, style, pad = spacing.insetXl }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  return <View style={[s.panel, { padding: pad }, style]}>{children}</View>;
}

export function KV({ k, v, vColor, strong }: { k: string; v: ReactNode; vColor?: string; strong?: boolean }) {
  return (
    <View style={s.kv}>
      <Txt v="label1" c={color.labelAlternative}>{k}</Txt>
      {typeof v === 'string' || typeof v === 'number' ? <Txt v="label1" w={strong ? 'bold' : 'semibold'} c={vColor ?? color.labelStrong} tabular style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Txt> : v}
    </View>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.inset3xl, gap: spacing.gapXs }}>
      <Txt v="body2" w="semibold" c={color.labelNeutral}>{title}</Txt>
      {text ? <Txt v="label2" c={color.labelAlternative} center>{text}</Txt> : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.gap2xs, paddingRight: spacing.insetXs, backgroundColor: color.bgNormal },
  sh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: spacing.gapM },
  shLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.gap2xs, minHeight: 44 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, minHeight: 56, paddingVertical: spacing.insetS },
  cellDiv: { borderBottomWidth: 1, borderBottomColor: color.lineAlternative },
  disc: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapS, minHeight: 48, paddingHorizontal: spacing.insetM, borderRadius: radius.control, backgroundColor: color.bgAlternative },
  panel: { borderRadius: radius.sheet, backgroundColor: color.elevatedNormal, borderWidth: 1, borderColor: color.lineAlternative, gap: spacing.gapL },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36, gap: spacing.gapL },
  footer: { paddingHorizontal: spacing.screen, paddingTop: spacing.insetM, paddingBottom: spacing.insetM, borderTopWidth: 1, borderTopColor: color.lineAlternative, backgroundColor: color.bgNormal, flexDirection: 'row', gap: spacing.gapM, alignItems: 'center' },
});
