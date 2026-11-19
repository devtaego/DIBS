import { createElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Icon, Txt, radius, spacing } from '@/ds';

// 쇼츠 영상. 앱과 같이 배포된 파일(상대 경로)이면 웹에서 바로 재생하고,
// 그 밖의 주소(시연용 가짜 CDN)나 네이티브에서는 자리 표시를 보여 준다.
const playable = (url: string) => Platform.OS === 'web' && !/^https?:\/\/cdn\.example\//.test(url);

export function ShortVideo({ url, durationSec }: { url: string; durationSec: number }) {
  if (playable(url)) {
    return (
      <View style={s.box}>
        {createElement('video', {
          src: url,
          autoPlay: true,
          muted: true,
          loop: true,
          playsInline: true,
          // 소리는 꺼진 채 자동 재생, 화면을 누르면 소리 켜기/끄기
          onClick: (e: { currentTarget: { muted: boolean } }) => { e.currentTarget.muted = !e.currentTarget.muted; },
          preload: 'metadata',
          style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
        })}
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
});
