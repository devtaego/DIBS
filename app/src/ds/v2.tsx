// Screens – MVP v2 공통 조각 (화면설계도 'DIBS Design System' 메인화면 페이지 기준)
// 탭 화면 머리말, 알약 칩, 표지 이미지, 미니 차트, 바텀시트처럼 여러 화면이 같은 모양을 쓰는 것만 모았다.
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { imageSource } from '@/lib/media';

import { Icon, Txt } from './base';
import { color } from './tokens';

export const PINK = '#C4426F';
export const PINK_SOFT = '#FBD9E3';
export const PINK_LINE = '#F6BFD0';
export const PINK_MUTED = '#B96C8B';

const TONES = [['#F6E3EA', '#9C3F66'], ['#E6EEFB', '#2F5DA8'], ['#EFE7FB', '#6A4BB8'], ['#E5F4EC', '#2F7A52'], ['#FBEEDC', '#9A5B12']];

/** 표지 이미지 (고정 크기). 이미지가 없으면 제목을 얹은 색 면 */
export function CoverImg({ id = 0, url, title, w, h, r = 12, style, shadow = true }: {
  id?: number; url?: string | null; title?: string; w: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle>; shadow?: boolean;
}) {
  const [bg, fg] = TONES[Math.abs(id) % TONES.length];
  const src = imageSource(url);
  return (
    <View style={[{ width: w, height: h, aspectRatio: h ? undefined : 2 / 3, borderRadius: r, overflow: 'hidden', backgroundColor: bg }, shadow && sh.cover, style]}
      accessibilityLabel={title ? `${title} 표지` : undefined}>
      {src ? <Image source={src} style={StyleSheet.absoluteFill} resizeMode="cover" /> : title ? (
        <View style={{ flex: 1, padding: 8, justifyContent: 'flex-end' }}><Txt v="caption1" w="bold" c={fg} lines={4}>{title}</Txt></View>
      ) : null}
    </View>
  );
}

/** 탭 화면 머리말: 제목(또는 로고) + 검색·알림 */
export function TabHeader({ title, badge, left, search = true, bell = true, onSearch, right }: {
  title?: string; badge?: string; left?: ReactNode; search?: boolean; bell?: boolean; onSearch?: () => void; right?: ReactNode;
}) {
  return (
    <View style={sh.header}>
      {left ?? <Txt v="heading1" w="bold" c={color.labelStrong}>{title}</Txt>}
      {badge ? <View style={sh.badge}><Txt v="caption2" w="bold" c={color.white} style={{ letterSpacing: 0.5 }}>{badge}</Txt></View> : null}
      <View style={{ flex: 1 }} />
      {right}
      {search ? <HeadBtn icon="search" label="검색" onPress={onSearch ?? (() => router.push('/explore'))} /> : null}
      {bell ? <HeadBtn icon="bell" label="알림" onPress={() => router.push('/notifications')} /> : null}
    </View>
  );
}

export function HeadBtn({ icon, label, onPress, c = color.labelStrong }: { icon: string; label: string; onPress?: () => void; c?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={sh.hb}>
      <Icon name={icon} size={24} c={c} />
    </Pressable>
  );
}

/** 하위 화면 머리말: 뒤로 + 가운데 제목 + 오른쪽 버튼 */
export function SubHeader({ title, right, onBack, close }: { title?: string; right?: ReactNode; onBack?: () => void; close?: boolean }) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const showBack = !close && (!!onBack || router.canGoBack());
  return (
    <View style={sh.sub}>
      <View style={{ width: 88, flexDirection: 'row' }}>{showBack ? <HeadBtn icon="back" label="뒤로" onPress={back} /> : null}</View>
      <Txt v="headline2" w="bold" c={color.labelStrong} lines={1} style={{ flex: 1, textAlign: 'center' }}>{title ?? ''}</Txt>
      <View style={{ width: 88, flexDirection: 'row', justifyContent: 'flex-end' }}>{right}{close ? <HeadBtn icon="close" label="닫기" onPress={back} /> : null}</View>
    </View>
  );
}

/** 화면 틀: 안전 영역 + 머리말 + 스크롤 본문 + 하단 고정 영역 */
export function V2Screen({ header, children, footer, tabBar, pad = 20, scroll = true, bg = color.bgNormal, gap = 0 }: {
  header?: ReactNode; children: ReactNode; footer?: ReactNode; tabBar?: boolean; pad?: number; scroll?: boolean; bg?: string; gap?: number;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={footer ? ['top', 'bottom'] : ['top']}>
      {header}
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: tabBar ? 120 : 32, gap }}>
          {children}
        </ScrollView>
      ) : <View style={{ flex: 1, paddingHorizontal: pad, gap }}>{children}</View>}
      {footer ? <View style={sh.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** 알약 칩 (활성: 진분홍 면 + 흰 글자) */
export function Pill({ label, active, onPress, h = 36 }: { label: string; active?: boolean; onPress?: () => void; h?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ height: h, paddingHorizontal: h >= 36 ? 16 : 12, borderRadius: 999, justifyContent: 'center', backgroundColor: active ? PINK : color.fillNormal }}>
      <Txt v="label1" w="semibold" c={active ? color.white : color.labelNeutral}>{label}</Txt>
    </Pressable>
  );
}

export function PillRow({ items, value, onChange, style }: { items: string[]; value: string; onChange: (v: string) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[{ gap: 8, paddingHorizontal: 20 }, style]}>
      {items.map((x) => <Pill key={x} label={x} active={x === value} onPress={() => onChange(x)} />)}
    </ScrollView>
  );
}

/** 작은 태그 (24px 알약) */
export function Tag({ label, tone = 'pink' }: { label: string; tone?: 'pink' | 'dark' | 'glass' | 'soft' | 'gray' }) {
  const bg = { pink: PINK, dark: 'rgba(25,31,40,0.72)', glass: 'rgba(255,255,255,0.18)', soft: PINK_SOFT, gray: color.fillNormal }[tone];
  const fg = tone === 'soft' ? PINK : tone === 'gray' ? color.labelNeutral : color.white;
  return <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: bg, justifyContent: 'center', alignSelf: 'flex-start' }}><Txt v="caption1" w="bold" c={fg}>{label}</Txt></View>;
}

/** 글자 탭 (전체 | 웹툰 | 웹소설) */
export function TextTabs<K extends string>({ items, value, onChange, divider = true }: { items: K[]; value: K; onChange: (k: K) => void; divider?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="tablist">
      {items.map((k, i) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {divider && i ? <View style={{ width: 1, height: 12, backgroundColor: color.lineNeutral }} /> : null}
          <Pressable onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: k === value }}>
            <Txt v="body2" w={k === value ? 'bold' : 'medium'} c={k === value ? color.labelStrong : color.labelAssistive}>{k}</Txt>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** 밑줄 탭 (상세 화면 탭: 소개 · 작가 이야기 · 펀딩 계획 등) */
export function UnderTabs<K extends string>({ items, value, onChange }: { items: K[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.lineAlternative }} accessibilityRole="tablist">
      {items.map((k) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: k === value }}
          style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: k === value ? color.labelStrong : 'transparent', marginBottom: -1 }}>
          <Txt v="body2" w={k === value ? 'bold' : 'medium'} c={k === value ? color.labelStrong : color.labelAssistive}>{k}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

/** 미니 꺾은선 (상승 빨강 · 하락 파랑) */
export function Spark({ values, up, w = 64, h = 26, area = false, stroke = 2.2 }: { values: number[]; up: boolean; w?: number; h?: number; area?: boolean; stroke?: number }) {
  if (values.length < 2) return <View style={{ width: w, height: h }} />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1, pad = Math.min(6, h * 0.2);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, pad + (1 - (v - min) / span) * (h - pad * 2)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const c = up ? color.rise : color.fall;
  return (
    <Svg width={w} height={h}>
      {area ? <Path d={`${line} L${w} ${h} L0 ${h} Z`} fill={c} opacity={0.12} /> : null}
      <Path d={line} stroke={c} strokeWidth={stroke} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** 바텀시트 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="닫기" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: color.dimmer }]} />
        <View style={sh.sheet}>
          <View style={sh.grab} />
          {title ? <Txt v="headline1" w="bold" c={color.labelStrong} style={{ marginHorizontal: 4, marginBottom: 8 }}>{title}</Txt> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** 선택지 목록 (바텀시트 안) */
export function SheetOptions({ items, value, onPick }: { items: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <View>
      {items.map((x) => (
        <Pressable key={x} onPress={() => onPick(x)} accessibilityRole="button" accessibilityState={{ selected: x === value }}
          style={{ height: 52, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
          <Txt v="body1" w="semibold" c={x === value ? color.labelStrong : color.labelNeutral}>{x}</Txt>
          {x === value ? <Txt v="body1" w="bold" c={PINK}>✓</Txt> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** 드롭다운 단추 (정렬·장르 선택) */
export function DropBtn({ label, onPress, outline }: { label: string; onPress: () => void; outline?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[{ height: outline ? 30 : 32, paddingLeft: outline ? 12 : 14, paddingRight: outline ? 8 : 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 2 },
      outline ? { borderWidth: 1, borderColor: color.lineNormal } : { backgroundColor: color.fillNormal }]}>
      <Txt v="label2" w="semibold" c={color.labelNormal}>{label}</Txt>
      <Icon name="chevD" size={16} c={color.labelNormal} />
    </Pressable>
  );
}

/** 큰 알약 단추 (화면 하단 주 동작) */
export function BigBtn({ label, onPress, tone = 'pink', disabled, style, h = 56 }: {
  label: string; onPress?: () => void; tone?: 'pink' | 'dark' | 'gray' | 'soft' | 'line'; disabled?: boolean; style?: StyleProp<ViewStyle>; h?: number;
}) {
  const bg = { pink: PINK, dark: color.labelStrong, gray: color.fillNormal, soft: PINK_SOFT, line: 'transparent' }[tone];
  const fg = tone === 'gray' || tone === 'line' ? color.labelNormal : tone === 'soft' ? PINK : color.white;
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [{ height: h, borderRadius: 999, backgroundColor: disabled ? color.interactionDisable : bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, paddingHorizontal: 20 },
        tone === 'line' && { borderWidth: 1, borderColor: color.lineNormal }, style]}>
      <Txt v="body1" w="bold" c={disabled ? color.labelDisable : fg}>{label}</Txt>
    </Pressable>
  );
}

/** 섹션 제목 줄 */
export function SecTitle({ title, sub, right, style }: { title: string; sub?: string; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, style]}>
      <View style={{ flexShrink: 1 }}>
        <Txt v="headline1" w="bold" c={color.labelStrong}>{title}</Txt>
        {sub ? <Txt v="caption1" w="medium" c={color.labelAssistive}>{sub}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

/** 카드 면 (흰 바탕 + 옅은 테두리 + 그림자) */
export function Card({ children, style, onPress, r = 20 }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; r?: number }) {
  const body = <View style={[sh.card, { borderRadius: r }, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

/** 한 줄 키-값 */
export function Line({ k, v, strong, vc }: { k: string; v: ReactNode; strong?: boolean; vc?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
      <Txt v="label1" w="medium" c={color.labelAlternative}>{k}</Txt>
      {typeof v === 'string' ? <Txt v={strong ? 'body1' : 'label1'} w={strong ? 'bold' : 'semibold'} c={vc ?? color.labelStrong} tabular>{v}</Txt> : v}
    </View>
  );
}

/** 단계 진행 점 (인트로·가이드) */
export function Dots({ n, i }: { n: number; i: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: n }).map((_, k) => <View key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? PINK : color.fillStrong }} />)}
    </View>
  );
}

/** 씨앗 n개 알약 (회차 가격) */
export function SeedChip({ n }: { n: number }) {
  return (
    <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: color.fillNormal, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 9, height: 13, borderRadius: 6, backgroundColor: '#7A5A48', transform: [{ rotate: '25deg' }] }} />
      <Txt v="caption1" w="bold" c={color.labelNeutral}>씨앗 {n}</Txt>
    </View>
  );
}

export const wonText = (n: number | null | undefined) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;
export const signed = (n: number, unit = '원') => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}${unit}`;
export const pctText = (n: number | null | undefined, d = 2) => (n == null ? '0.00%' : `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(d)}%`);

/** 같은 값을 넣으면 늘 같은 모양인 보기용 흐름 (기록이 아직 없는 작품의 미니 차트) */
export function seededSeries(seed: number, n = 18, up = true) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < n; i++) { v += (rnd() - 0.5) * 8 + (up ? 0.9 : -0.9); out.push(v); }
  return out;
}

const sh = StyleSheet.create({
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 24, paddingRight: 8, marginTop: Platform.OS === 'web' ? 0 : 4 },
  sub: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  badge: { height: 20, paddingHorizontal: 7, borderRadius: 6, backgroundColor: color.labelStrong, justifyContent: 'center' },
  hb: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  cover: { shadowColor: '#191F28', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: color.bgNormal },
  sheet: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 34, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: color.bgNormal },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: color.lineNeutral, marginBottom: 14 },
  card: { backgroundColor: color.elevatedNormal, borderWidth: 1, borderColor: color.lineAlternative, overflow: 'hidden',
    shadowColor: '#191F28', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
});
