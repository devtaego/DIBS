import { createElement, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Icon, Txt, radius, spacing } from '@/ds';

// 쇼츠 영상. 앱과 같이 배포된 파일(상대 경로)이면 웹에서 바로 재생하고,
// 그 밖의 주소(시연용 가짜 CDN)나 네이티브에서는 자리 표시를 보여 준다.
export const isPlayable = (url: string) => Platform.OS === 'web' && !/^https?:\/\/cdn\.example\//.test(url);

type Props = {
  url: string;
  durationSec: number;
  active?: boolean; // 화면에 보이는 영상만 재생
  muted?: boolean;
  loop?: boolean; // 다음 영상이 없을 때만 반복
  onEnded?: () => void;
  onToggleMute?: () => void;
};

type VideoEl = { play: () => Promise<void>; pause: () => void; currentTime: number; muted: boolean };

export function ShortVideo({ url, durationSec, active = true, muted = true, loop = false, onEnded, onToggleMute }: Props) {
  const ref = useRef<VideoEl | null>(null);

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
      <View style={s.box}>
        {createElement('video', {
          ref,
          src: url,
          muted,
          loop,
          playsInline: true,
          preload: active ? 'auto' : 'metadata',
          onEnded,
          onClick: onToggleMute,
          style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
        })}
        <View style={s.sound} pointerEvents="none">
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
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.gapM },
  sound: {
    position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
