// 프로토타입(design/DIBS_프로토타입_디비.html)의 마스코트 '디비'와 공통 조각.
// 사용 원칙(디자인팀): 결제·청약·주문의 로딩과 완료, 빈 화면, 위험 안내에만 등장.
// 호가·차트 본문에는 넣지 않고, 수익·가격 상승을 축하하지 않는다. 한 화면에 한 번만.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { imageSource } from '@/lib/media';
import { Animated, Easing, Image, Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overlay } from '@/components/Overlay';
import { Button, T } from '@/components/ui';
import { colors, radii, space, type as ts } from '@/lib/theme';

export type Pose = 'hello' | 'careful' | 'dibs' | 'discover' | 'done' | 'jump' | 'peek' | 'puff' | 'report' | 'run' | 'sleep' | 'bow';

const POSES: Record<Pose, { src: ImageSourcePropType; ar: number }> = {
  hello: { src: require('../../assets/dibby/hello.png'), ar: 231 / 360 },
  careful: { src: require('../../assets/dibby/careful.png'), ar: 232 / 360 },
  dibs: { src: require('../../assets/dibby/dibs.png'), ar: 223 / 360 },
  discover: { src: require('../../assets/dibby/discover.png'), ar: 177 / 360 },
  done: { src: require('../../assets/dibby/done.png'), ar: 227 / 360 },
  jump: { src: require('../../assets/dibby/jump.png'), ar: 286 / 360 },
  peek: { src: require('../../assets/dibby/peek.png'), ar: 266 / 360 },
  puff: { src: require('../../assets/dibby/puff.png'), ar: 245 / 360 },
  report: { src: require('../../assets/dibby/report.png'), ar: 238 / 360 },
  run: { src: require('../../assets/dibby/run.png'), ar: 327 / 360 },
  sleep: { src: require('../../assets/dibby/sleep.png'), ar: 360 / 306 },
  bow: { src: require('../../assets/dibby/bow.png'), ar: 242 / 360 },
};

/** 통통 튀는 디비. size = 높이(px) */
export function Dibby({ pose, size, bob = true, style }: { pose: Pose; size: number; bob?: boolean; style?: StyleProp<ViewStyle> }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bob) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 800, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, y]);
  const p = POSES[pose];
  const h = pose === 'sleep' ? size * 0.85 : size;
  return (
    <Animated.View style={[{ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.06] }) }] }, style]} accessibilityRole="image" accessibilityLabel="디비">
      <Image source={p.src} style={{ height: h, width: h * p.ar }} resizeMode="contain" />
    </Animated.View>
  );
}

/** 인사 카드 (홈·MY 상단) */
export function Greet({ pose, title, text, style }: { pose: Pose; title: string; text: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.pinkCard, { paddingRight: 104, minHeight: 100 }, style]}>
      <View style={{ flex: 1 }}>
        <T size={ts.headline1.fontSize - 1} weight="700" style={{ marginBottom: 4 }}>{title}</T>
        <T size={13} color={colors.labelNeutral}>{text}</T>
      </View>
      <Dibby pose={pose} size={86} style={{ position: 'absolute', right: 10, bottom: 6 }} />
    </View>
  );
}

/** 위험 안내 (청약·주문 버튼 위) */
export function DNote({ pose = 'careful', title, text, style }: { pose?: Pose; title: string; text: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.pinkCard, { paddingLeft: 84, minHeight: 78 }, style]}>
      <Dibby pose={pose} size={66} bob={false} style={{ position: 'absolute', left: 10, bottom: 6 }} />
      <View style={{ flex: 1 }}>
        <T size={14} weight="700" style={{ marginBottom: 2 }}>{title}</T>
        <T size={12} color={colors.labelNeutral}>{text}</T>
      </View>
    </View>
  );
}

/** 빈 화면 */
export function DEmpty({ pose = 'peek', title, text, cta, onPress }: { pose?: Pose; title: string; text: string; cta?: string; onPress?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space(6), gap: 4 }}>
      <Dibby pose={pose} size={74} style={{ marginBottom: space(2) }} />
      <T size={16} weight="700">{title}</T>
      <T size={13} color={colors.labelAlternative} style={{ textAlign: 'center' }}>{text}</T>
      {cta && onPress ? <Button title={cta} kind="ghost" onPress={onPress} style={{ marginTop: space(3), height: 40, alignSelf: 'center' }} /> : null}
    </View>
  );
}

/** 작품 표지 자리 (이미지가 없으면 그라데이션 + 제목) */
const GRADS: [string, string, string][] = [
  ['#F7B8CF', '#E5718F', '#8F3A5E'],
  ['#9A92A7', '#4B4B66', '#2B2C44'],
  ['#E2C6F2', '#7C5CD6', '#2A1620'],
  ['#B9D3F5', '#3A5A8C', '#191F28'],
  ['#F3D3E0', '#C97C99', '#4B1528'],
  ['#FCE6EE', '#DE5786', '#2A1620'],
];
export function Cover({ id, title, genre, coverUrl, small, style }: { id: number; title: string; genre?: string; coverUrl?: string | null; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const g = GRADS[id % GRADS.length];
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: g[1] }, style]}>
      {imageSource(coverUrl) ? (
        <Image source={imageSource(coverUrl)} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`${title} 표지`} />
      ) : (
        <>
          <LinearGradient colors={g} locations={[0, 0.55, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[s.moon, small && { opacity: 0.6 }]} />
          {genre && !small ? <T size={10} weight="700" color="#FFFFFF" style={{ position: 'absolute', top: 12, right: 12, opacity: 0.85, letterSpacing: 0.8 }}>{genre}</T> : null}
          <T size={small ? 8 : 17} weight="700" color="#FFFFFF" numberOfLines={3} style={[s.cvTitle, small && { left: 5, right: 5, bottom: 5, lineHeight: 11 }]}>{title}</T>
        </>
      )}
    </View>
  );
}

/** 작은 표지 + 두 줄 (목록 행) */
export function MiniWork({ id, title, line2, coverUrl, right }: { id: number; title: string; line2: string; coverUrl?: string | null; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
      <Cover id={id} title={title} coverUrl={coverUrl} small style={{ width: 52, height: 72, borderRadius: radii.thumb }} />
      <View style={{ flex: 1 }}>
        <T size={14} weight="700" numberOfLines={1}>{title}</T>
        <T size={12} weight="500" color={colors.labelAlternative} numberOfLines={1} style={{ marginTop: 2 }}>{line2}</T>
      </View>
      {right}
    </View>
  );
}

/** 칩 (모의·장르·NEW) */
export function Chip({ label, tone = 'default' }: { label: string; tone?: 'default' | 'pink' }) {
  return (
    <View style={[s.chip, { backgroundColor: tone === 'pink' ? colors.highlightFill : colors.fillNormal }]}>
      <T size={12} weight="600" color={tone === 'pink' ? colors.highlight : colors.labelNeutral}>{label}</T>
    </View>
  );
}

/** '모의 · 실제 거래 없음' 표시 */
export function ModeFlag({ text = '모의 시연 · 실제 거래 없음' }: { text?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
      <T size={12} weight="500" color={colors.labelAlternative}>{text}</T>
    </View>
  );
}

/** 섹션 머리 */
export function SecH({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(6), marginBottom: space(3) }}>
      <T size={ts.headline1.fontSize} weight="700">{title}</T>
      {right}
    </View>
  );
}

/** 진행 막대 위를 달리는 디비. label 을 주면 디비에 마우스를 올리거나(웹) 누르면 머리 위에 작게 보여 준다 */
export function Ride({ pct, pose = 'run', label, always }: { pct: number; pose?: Pose; label?: string; always?: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  const [hover, setShow] = useState(false);
  const show = always || hover; // always: 말풍선을 늘 띄운다 (펀딩 상세)
  // 막대 끝 쪽에서는 말풍선이 패널 밖으로 나가지 않게 한쪽으로 붙인다
  const align = p > 85 ? 'flex-end' : p < 15 ? 'flex-start' : 'center';
  return (
    <View style={{ paddingTop: 34, marginVertical: space(1), zIndex: 2 }}>
      <View style={{ position: 'absolute', top: 0, left: `${p}%`, marginLeft: -18, zIndex: 2 }}>
        {label && show ? (
          <View pointerEvents="none" style={[s.tipWrap, { alignItems: align }, align === 'flex-end' ? { right: 0 } : align === 'flex-start' ? { left: 0 } : { left: -42 }]}>
            <View style={s.tip}>
              <T size={11} weight="700" color="#FFFFFF">{label}</T>
            </View>
          </View>
        ) : null}
        <Pressable
          onHoverIn={() => setShow(true)}
          onHoverOut={() => setShow(false)}
          onPress={() => setShow((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={label ?? '디비'}>
          <Dibby pose={pose} size={36} />
        </Pressable>
      </View>
      <View style={s.prog}>
        <View style={[s.progFill, { width: `${p}%` }]} />
      </View>
    </View>
  );
}

/** 화면 아래 고정 버튼 줄 */
export function CtaBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[s.cta, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>{children}</View>;
}

/** 결제·청약·주문 로딩: 디비가 진행 막대 위를 달린다 */
export function DibbyLoading({ visible, title, step, pct }: { visible: boolean; title: string; step: string; pct: number }) {
  return (
    <Overlay visible={visible} animationType="fade">
      <View style={s.dl}>
        <View style={{ width: '78%' }}>
          <Ride pct={pct} />
        </View>
        <T size={ts.heading2.fontSize} weight="700" style={{ marginTop: space(6) }}>{title}</T>
        <T size={14} weight="500" color={colors.labelAlternative} style={{ marginTop: space(2) }}>{step}</T>
        <T size={13} weight="700" color={colors.primary} style={{ marginTop: space(3) }}>{Math.round(pct)}%</T>
        <View style={{ position: 'absolute', bottom: 56, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T size={12} weight="500" color={colors.labelAssistive}>원금 손실 가능 · 예금자 보호 대상 아님</T>
        </View>
      </View>
    </Overlay>
  );
}

const s = StyleSheet.create({
  pinkCard: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.card, padding: space(4), backgroundColor: colors.highlightFill, marginTop: space(4) },
  moon: { position: 'absolute', width: '62%', aspectRatio: 1, borderRadius: 999, right: '-14%', top: '-8%', backgroundColor: 'rgba(255,255,255,0.22)' },
  cvTitle: { position: 'absolute', left: 12, right: 12, bottom: 14, letterSpacing: -0.6, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  chip: { height: 26, paddingHorizontal: 10, borderRadius: radii.chip, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  tipWrap: { position: 'absolute', bottom: 38, width: 120 },
  tip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(25,31,40,0.88)' },
  prog: { height: 6, borderRadius: 999, backgroundColor: colors.fillNormal, overflow: 'hidden' },
  progFill: { height: 6, borderRadius: 999, backgroundColor: colors.progress },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', gap: 8, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  dl: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
