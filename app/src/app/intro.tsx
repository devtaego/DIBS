import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Txt, color, spacing } from '@/ds';
import { markIntroSeen } from '@/lib/intro';
import { imageSource } from '@/lib/media';

// V2 00 인트로 4장 (디자인 시스템 프로토타입 기준): 위 = 표지 콜라주 + 말풍선, 아래 = 제목·설명·버튼. 다크 배경.
const SLIDES = [
  {
    covers: ['covers/ond.jpg', 'covers/htj.jpg', 'covers/jnb.jpg'],
    bubble: '"이 작품, 무조건 뜬다!"',
    title: '뜰 것 같은 웹툰,\n먼저 찜하세요',
    sub: '연재가 커지기 전에 작품 조각을 사 둘 수 있어요.',
  },
  {
    covers: ['covers/njs.jpg', 'covers/wrb.jpg', 'covers/ghb.jpg'],
    bubble: '"1조각에 천 원이래"',
    title: '1조각에 1천 원,\n부담 없이 시작해요',
    sub: '공모가 열리면 원하는 만큼 조각을 사요. 최소 1조각부터예요.',
  },
  {
    covers: ['covers/sgl.jpg', 'covers/pmb.jpg', 'covers/nch.jpg'],
    bubble: '"1분 티저 봤어? 미쳤어"',
    title: '1분 쇼츠로\n신작을 먼저 봐요',
    sub: '티저를 보고 마음에 들면 찜해 두세요. 공모가 열리면 알려 드려요.',
  },
  {
    covers: ['covers/isg.jpg', 'covers/hgd.jpg', 'covers/dsg.jpg'],
    bubble: '"정산금 들어왔다!"',
    title: '작품이 벌면\n나도 받아요',
    sub: '연재·드라마 수익을 조각만큼 분기마다 정산해요.',
  },
];

const BG = '#16151F';

export default function Intro() {
  const insets = useSafeAreaInsets();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const again = replay === '1'; // MY > 앱 소개 다시 보기: 마지막은 '닫기'
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  const done = async () => {
    if (again) return router.canGoBack() ? router.back() : router.replace('/');
    await markIntroSeen();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* 표지 콜라주 */}
      <View style={s.collage}>
        <View style={{ flex: 1.15, flexDirection: 'row', gap: 4 }}>
          <Tile src={slide.covers[0]} style={{ flex: 1.35 }} />
          <Tile src={slide.covers[1]} style={{ flex: 1 }} />
        </View>
        <Tile src={slide.covers[2]} style={{ flex: 1 }} />
        <View style={s.bubble}>
          <Txt v="label1" w="bold" c="#191F28">{slide.bubble}</Txt>
        </View>
        <View pointerEvents="none" style={s.fade} />
      </View>

      {again ? null : (
        // 다시 보기에서는 아래 '닫기' 버튼 하나만 둔다
        <Pressable onPress={done} hitSlop={10} style={[s.skip, { top: insets.top + 12 }]} accessibilityRole="button">
          <Txt v="label2" w="semibold" c="rgba(255,255,255,0.85)">건너뛰기</Txt>
        </Pressable>
      )}

      <View style={[s.bottom, { paddingBottom: insets.bottom + spacing.insetL }]}>
        <View style={s.dots}>
          {SLIDES.map((_, k) => <View key={k} style={[s.dot, k === i && s.dotOn]} />)}
        </View>
        <Txt v="title2" w="bold" c="#FFFFFF">{slide.title}</Txt>
        <Txt v="label2" c="rgba(255,255,255,0.62)">{slide.sub}</Txt>
        <View style={{ gap: spacing.gapM, marginTop: spacing.insetL }}>
          <Button label={last ? (again ? '닫기' : '시작하기') : '다음'} onPress={() => (last ? done() : setI(i + 1))} />
          {last && !again ? (
            <Pressable onPress={done} style={s.ghost} accessibilityRole="button">
              <Txt v="body1" w="semibold" c="#FFFFFF">이미 계정이 있어요</Txt>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Tile({ src, style }: { src: string; style: object }) {
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#222' }, style]}>
      <Image source={imageSource(src)} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </View>
  );
}

const s = StyleSheet.create({
  collage: { flex: 1.25, gap: 4 },
  bubble: { position: 'absolute', left: spacing.screen, top: '50%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF', transform: [{ translateY: -18 }] },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, backgroundColor: 'rgba(22,21,31,0.55)' },
  skip: { position: 'absolute', right: spacing.screen, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)' },
  bottom: { paddingHorizontal: spacing.screen, paddingTop: spacing.insetXl, gap: spacing.gapS, backgroundColor: BG },
  ghost: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  dots: { flexDirection: 'row', gap: 6, marginBottom: spacing.gapM },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)' },
  dotOn: { width: 18, backgroundColor: color.primarySoft },
});
