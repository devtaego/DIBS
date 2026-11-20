import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Icon, Txt, radius, spacing } from '@/ds';
import { videoSource } from '@/lib/media';
import { Scrubber } from './Scrubber';

// 웹 쇼츠 영상 (<video>). 시연용 가짜 CDN 주소면 자리 표시. iOS·Android 는 ShortVideo.native.tsx.
export const isPlayable = (url: string) => Platform.OS === 'web' && videoSource(url) != null;

type Props = {
  url: string;
  durationSec: number;
  active?: boolean; // 화면에 보이는 영상만 재생
  muted?: boolean;
  loop?: boolean; // 다음 영상이 없을 때만 반복
  onEnded?: () => void;
  onToggleMute?: () => void;
  full?: boolean; // 몰입형(가장자리까지, 모서리 둥글림 없음)
  scrubBottom?: number; // 주면 그 높이에 재생 막대(끌어서 이동)
};

type VideoEl = { play: () => Promise<void>; pause: () => void; currentTime: number; muted: boolean };

export function ShortVideo({ url, durationSec, active = true, muted = true, loop = false, onEnded, onToggleMute, full, scrubBottom }: Props) {
  const ref = useRef<VideoEl | null>(null);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(durationSec);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => {
        // 소리 켠 자동 재생이 막히면 음소거로 다시 시도
        v.muted = true;
        v.play().catch(() => undefined);
      });
    } else {
      v.pause();
    }
  }, [active]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  if (isPlayable(url)) {
    return (
      <View style={[s.box, full && s.full]}>
        {createElement('video', {
          ref,
          src: url,
          muted,
          loop,
          playsInline: true,
          preload: active ? 'auto' : 'metadata',
          onEnded,
          onTimeUpdate: (e: { currentTarget: { currentTime: number } }) => setCur(e.currentTarget.currentTime),
          onLoadedMetadata: (e: { currentTarget: { duration: number } }) => setDur(e.currentTarget.duration || durationSec),
          onClick: onToggleMute,
          style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
        })}
        {scrubBottom != null && active ? (
          <Scrubber current={cur} duration={dur} bottom={scrubBottom} onSeek={(sec) => { if (ref.current) { ref.current.currentTime = sec; setCur(sec); } }} />
        ) : null}
        <View style={[s.sound, full && s.soundFull]} pointerEvents="none">
          <Icon name={muted ? 'volOff' : 'vol'} size={16} c="#F3E8EE" />
          <Txt v="caption2" c="#F3E8EE">{muted ? '눌러서 소리 켜기' : '소리 켜짐'}</Txt>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.box, s.placeholder]}>
      <Icon name="play" size={56} c="rgba(243,232,238,0.85)" />
      <Txt v="caption1" c="rgba(243,232,238,0.6)">{durationSec}초 · 영상 자리 (시연용)</Txt>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flex: 1, borderRadius: radius.sheet, overflow: 'hidden', backgroundColor: '#1B1C29' },
  full: { borderRadius: 0 },
  soundFull: { display: 'none' }, // 몰입형에서는 오른쪽 버튼 줄의 소리 버튼으로
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.gapM },
  sound: {
    position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
