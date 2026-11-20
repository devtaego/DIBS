import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { Txt } from '@/ds';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * 쇼츠 재생 막대: 손가락이 닿기 쉬운 44pt 높이, 누른 곳으로 바로 이동, 끄는 동안 크게 표시.
 * 양쪽에 현재·전체 시간을 늘 보여 주고, 화면 읽기 기능에서는 10초씩 앞뒤로 옮길 수 있다.
 */
export function Scrubber({ current, duration, onSeek, bottom }: { current: number; duration: number; onSeek: (sec: number) => void; bottom: number }) {
  const [drag, setDrag] = useState<number | null>(null);
  const box = useRef<{ measure: (cb: (x: number, y: number, w: number, h: number, px: number, py: number) => void) => void } | null>(null);
  const geo = useRef({ x: 0, w: 1 });
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;
  const durRef = useRef(duration);
  durRef.current = duration;
  const ratioAt = (pageX: number) => Math.min(1, Math.max(0, (pageX - geo.current.x) / geo.current.w));
  const measure = () => box.current?.measure((_x: number, _y: number, w: number, _h: number, px: number) => { geo.current = { x: px, w: w || 1 }; });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { measure(); setDrag(ratioAt(e.nativeEvent.pageX)); },
      onPanResponderMove: (e) => setDrag(ratioAt(e.nativeEvent.pageX)),
      onPanResponderRelease: (e) => { const r = ratioAt(e.nativeEvent.pageX); setDrag(null); seekRef.current(r * durRef.current); },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;

  const ratio = drag ?? (duration ? Math.min(1, current / duration) : 0);
  const shownSec = drag != null ? drag * duration : current;
  return (
    <View style={[s.wrap, { bottom }]} pointerEvents="box-none">
      {drag != null ? (
        <View style={s.bubble} pointerEvents="none">
          <Txt v="headline2" w="bold" c="#FFFFFF" tabular>{`${mmss(shownSec)} / ${mmss(duration)}`}</Txt>
        </View>
      ) : null}
      <View style={s.row} pointerEvents="box-none">
        <Txt v="caption2" w="semibold" c="rgba(255,255,255,0.85)" tabular style={s.t}>{mmss(shownSec)}</Txt>
        <View
          ref={box as never}
          {...pan.panHandlers}
          onLayout={measure}
          style={s.hit}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="재생 위치"
          accessibilityValue={{ text: `${mmss(current)} / ${mmss(duration)}` }}
          accessibilityActions={[{ name: 'increment', label: '10초 앞으로' }, { name: 'decrement', label: '10초 뒤로' }]}
          onAccessibilityAction={(e) => onSeek(Math.min(duration, Math.max(0, current + (e.nativeEvent.actionName === 'increment' ? 10 : -10))))}>
          <View style={[s.track, drag != null && s.trackOn]} pointerEvents="none">
            <View style={[s.fill, { width: `${ratio * 100}%` }]} />
          </View>
          <View pointerEvents="none" style={[s.knob, { left: `${ratio * 100}%` }, drag != null && s.knobOn]} />
        </View>
        <Txt v="caption2" w="semibold" c="rgba(255,255,255,0.85)" tabular style={s.t}>{mmss(duration)}</Txt>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  t: { minWidth: 34, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  hit: { flex: 1, height: 44, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  trackOn: { height: 8, borderRadius: 4 },
  fill: { height: '100%', backgroundColor: '#F6A9BF' },
  knob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3 },
  knobOn: { width: 24, height: 24, borderRadius: 12, marginLeft: -12 },
  bubble: { alignSelf: 'center', marginBottom: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.65)' },
});
