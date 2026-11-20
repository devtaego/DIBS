import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { Txt } from '@/ds';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 쇼츠 재생 막대: 끌거나 눌러서 원하는 시간으로 옮긴다. 끄는 동안 시간 표시 */
export function Scrubber({ current, duration, onSeek, bottom }: { current: number; duration: number; onSeek: (sec: number) => void; bottom: number }) {
  const [w, setW] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef({ w: 1, x0: 0 });
  ref.current.w = w;
  const ratioAt = (x: number) => Math.min(1, Math.max(0, x / ref.current.w));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setDrag(ratioAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setDrag(ratioAt(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        const r = ratioAt(e.nativeEvent.locationX);
        setDrag(null);
        onSeekRef.current(r);
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;
  const onSeekRef = useRef((r: number) => onSeek(r * duration));
  onSeekRef.current = (r: number) => onSeek(r * duration);

  const ratio = drag ?? (duration ? current / duration : 0);
  return (
    <View style={[s.wrap, { bottom }]} pointerEvents="box-none">
      {drag != null ? (
        <View style={s.time} pointerEvents="none">
          <Txt v="label1" w="bold" c="#FFFFFF" tabular>{`${mmss(drag * duration)} / ${mmss(duration)}`}</Txt>
        </View>
      ) : null}
      <View
        {...pan.panHandlers}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={s.hit}
        accessibilityRole="adjustable"
        accessibilityLabel="재생 위치"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(current) }}>
        <View style={[s.track, drag != null && s.trackOn]} pointerEvents="none">
          <View style={[s.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[s.knob, { left: `${ratio * 100}%` }, drag != null && s.knobOn]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'stretch' },
  hit: { height: 24, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.32)', overflow: 'hidden' },
  trackOn: { height: 6, borderRadius: 3 },
  fill: { height: '100%', backgroundColor: '#F6A9BF' },
  knob: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, backgroundColor: '#FFFFFF' },
  knobOn: { width: 18, height: 18, borderRadius: 9, marginLeft: -9 },
  time: { alignSelf: 'center', marginBottom: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)' },
});
