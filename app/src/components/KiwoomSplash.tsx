// 키움증권으로 넘어가는 시작 화면 (청약 결제·예치금 충전·출금에서 같이 쓴다)
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 키움 앱으로 넘어가는 느낌의 시작 화면 (모의 제휴 시연). 약 2초 동안 진행 막대가 차오른 뒤 결제 화면으로 */
export function KiwoomSplash({ onDone, line1 = '잘 키우고 싶은 투자 본능', line2, sub = 'DIBS에서 결제 화면으로 이동하고 있어요' }: { onDone: () => void; line1?: string; line2?: string; sub?: string }) {
  const insets = useSafeAreaInsets();
  const p = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // 한 번만 돌린다 (부모가 다시 그려져도 처음부터 다시 시작하거나 일찍 끝나지 않게)
    const id = p.addListener(({ value }) => setPct(Math.round(value * 100)));
    let t: ReturnType<typeof setTimeout> | undefined;
    Animated.timing(p, { toValue: 1, duration: 2200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (finished) t = setTimeout(() => done.current(), 250);
    });
    return () => { p.removeListener(id); if (t) clearTimeout(t); };
  }, [p]);
  return (
    <View style={[k.wrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>
      <Text style={k.top}>DIBS × 키움증권</Text>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 120 }}>
        <Text style={k.tag}>{line1}</Text>
        {line2 ? <Text style={k.head}>{line2}</Text> : <Text style={k.head}><Text style={{ color: '#8EA2FF' }}>조각투자</Text>도 키움</Text>}
      </View>
      {/* 상자에서 튀어나오는 조각들 (그림 대신 도형) */}
      <View style={k.stage}>
        <View style={k.glow} />
        <View style={[k.chip, { backgroundColor: '#2F6BFF', left: 70, top: 10, transform: [{ rotate: '-8deg' }] }]}><Text style={k.chipT}>STO</Text></View>
        <View style={[k.chip, { backgroundColor: '#E2508C', left: 150, top: 46, transform: [{ rotate: '10deg' }] }]}><Text style={k.chipT}>조각</Text></View>
        <View style={[k.chip, { backgroundColor: '#7B5CF0', left: 84, top: 92, borderRadius: 40 }]}><Text style={k.chipT}>웹툰</Text></View>
        <View style={k.box}><Text style={k.boxT}>키움증권</Text></View>
      </View>
      <View style={{ flex: 1 }} />
      <Text style={k.brand}>키움증권</Text>
      <Text style={k.sub}>{sub}</Text>
      <View style={k.barRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={k.ver}>Ver.1.6.2</Text>
          <View style={k.track}>
            <Animated.View style={[k.fill, { width: p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>
        <Text style={k.pct}>{pct}%</Text>
      </View>
    </View>
  );
}

const k = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0D0A26', paddingHorizontal: 28, alignItems: 'stretch' },
  top: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'Pretendard-Medium', textAlign: 'center' },
  tag: { color: 'rgba(255,255,255,0.86)', fontSize: 18, fontFamily: 'Pretendard-Medium' },
  head: { color: '#FFFFFF', fontSize: 38, fontFamily: 'Pretendard-Bold', letterSpacing: -1 },
  stage: { alignSelf: 'center', width: 260, height: 220, marginTop: 48 },
  glow: { position: 'absolute', left: 10, top: 0, width: 240, height: 220, borderRadius: 120, backgroundColor: 'rgba(47,107,255,0.22)' },
  chip: { position: 'absolute', width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  chipT: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Pretendard-Bold' },
  box: { position: 'absolute', left: 30, right: 30, bottom: 0, height: 64, borderRadius: 14, backgroundColor: '#D9DCE6', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 16 },
  boxT: { color: '#8D93A6', fontSize: 15, fontFamily: 'Pretendard-Bold' },
  brand: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Pretendard-Bold', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'Pretendard-Regular', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  ver: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Pretendard-Medium' },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#2F49FF' },
  pct: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Pretendard-Medium', width: 44, textAlign: 'right' },
});
