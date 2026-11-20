import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Txt, radius, spacing } from '@/ds';
import { videoSource } from '@/lib/media';
import { Scrubber } from './Scrubber';

// iOS·Android(Expo Go 포함) 쇼츠 영상. 앱에 번들된 데모 영상이나 실제 영상 주소면 expo-video 로 재생하고,
// 시연용 가짜 CDN 주소면 자리 표시를 보여 준다. 웹은 ShortVideo.tsx.
export const isPlayable = (url: string) => videoSource(url) != null;

type Props = {
  url: string;
  onProgress?: (ratio: number) => void; // 재생 위치 0~1 (위쪽 진행 막대용)
  durationSec: number;
  active?: boolean; // 화면에 보이는 영상만 재생
  muted?: boolean;
  loop?: boolean; // 다음 영상이 없을 때만 반복
  onEnded?: () => void;
  onToggleMute?: () => void;
  full?: boolean; // 몰입형(가장자리까지, 모서리 둥글림 없음)
  scrubBottom?: number; // 주면 그 높이에 재생 막대(끌어서 이동)
};

export function ShortVideo(props: Props) {
  const src = videoSource(props.url);
  if (src == null) {
    return (
      <View style={[s.box, s.placeholder]}>
        <Icon name="play" size={56} c="rgba(243,232,238,0.85)" />
        <Txt v="caption1" c="rgba(243,232,238,0.6)">{props.durationSec}초 · 영상 준비 중</Txt>
      </View>
    );
  }
  return <Player src={src} {...props} />;
}

function Player({ src, active = true, muted = true, loop = false, onEnded, onToggleMute, full, scrubBottom, durationSec, onProgress }: Props & { src: number | string }) {
  const [cur, setCur] = useState(0);
  const progRef = useRef(onProgress);
  progRef.current = onProgress;
  const player = useVideoPlayer(src, (p) => {
    p.muted = muted;
    p.loop = loop;
  });
  const ended = useRef(onEnded);
  ended.current = onEnded;

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    player.loop = loop;
  }, [player, loop]);

  useEffect(() => {
    if (active) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [player, active]);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => ended.current?.());
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    player.timeUpdateEventInterval = 0.25;
    const sub = player.addListener('timeUpdate', ({ currentTime }) => { setCur(currentTime); progRef.current?.(currentTime / (player.duration || durationSec || 1)); });
    return () => sub.remove();
  }, [player]);

  return (
    <Pressable style={[s.box, full && s.full]} onPress={onToggleMute} accessibilityRole="button" accessibilityLabel={muted ? '소리 켜기' : '소리 끄기'}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
      {scrubBottom != null && active ? (
        <Scrubber current={cur} duration={player.duration || durationSec} bottom={scrubBottom} onSeek={(sec) => { player.currentTime = sec; setCur(sec); }} />
      ) : null}
      <View style={[s.sound, full && s.soundFull]} pointerEvents="none">
        <Icon name={muted ? 'volOff' : 'vol'} size={16} c="#F3E8EE" />
        <Txt v="caption2" c="#F3E8EE">{muted ? '눌러서 소리 켜기' : '소리 켜짐'}</Txt>
      </View>
    </Pressable>
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
