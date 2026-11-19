import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, LinearProgress, Txt, color, radius, spacing } from '@/ds';
import { api, track, type FundingCard, type ShortItem } from '@/lib/api';
import { ddayText, manwon } from '@/lib/cards';
import { useApi } from '@/lib/useApi';
import { ShortVideo, isPlayable } from '@/components/ShortVideo';

// 순환 재생: 마지막 다음에 처음이 오도록 목록을 여러 번 이어 붙인다
const LAPS = 50;

// V2 03 쇼츠 (전 화면 중 유일한 다크) — 세로로 넘기는 1분 하이라이트 + 펀딩 바로가기 카드
// 재생 가능한 영상이 있으면 그 영상들만 차례로 돌린다 (끝나면 다음, 마지막 다음은 처음).
export default function Shorts() {
  const [h, setH] = useState(0);
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(true);
  const listRef = useRef<FlatList<number>>(null);
  const { data } = useApi(async () => {
    const [shorts, fundings] = await Promise.all([
      api.get<ShortItem[]>('/shorts/feed', { limit: 50 }),
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
    ]);
    return { shorts, fundings };
  });
  const fundingById = useMemo(() => new Map((data?.fundings ?? []).map((f) => [f.id, f])), [data]);
  const items = useMemo(() => {
    const all = data?.shorts ?? [];
    const playable = all.filter((sh) => isPlayable(sh.video_url));
    return playable.length ? playable : all;
  }, [data]);
  const cycle = items.length > 1;
  const slots = useMemo(() => Array.from({ length: items.length * (cycle ? LAPS : 1) }, (_, i) => i), [items, cycle]);
  const next = useCallback(
    (from: number) => listRef.current?.scrollToIndex({ index: Math.min(from + 1, slots.length - 1), animated: true }),
    [slots.length],
  );
  useEffect(() => {
    data?.shorts.forEach((sh) => track('SHORT_PLAY', { work_id: sh.work_id, short_id: sh.id }));
  }, [data]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.shortsBg }} edges={['top']}>
      <View style={s.top}>
        <Txt v="headline1" w="bold" c={color.shortsLabel}>쇼츠</Txt>
        <Txt v="caption1" c="rgba(243,232,238,0.6)">1분 하이라이트</Txt>
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
        {h ? (
          <FlatList
            ref={listRef}
            data={slots}
            keyExtractor={(i) => String(i)}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: h, offset: h * index, index })}
            windowSize={3}
            initialNumToRender={2}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.y / h);
              if (i !== current) setCurrent(i);
            }}
            ListEmptyComponent={
              <View style={{ height: h, alignItems: 'center', justifyContent: 'center', gap: spacing.gapM }}>
                <Txt v="body1" w="bold" c={color.shortsLabel}>쇼츠는 곧 열려요</Txt>
                <Txt v="label2" c="rgba(243,232,238,0.6)">작품 하이라이트 영상을 준비하고 있어요.</Txt>
              </View>
            }
            renderItem={({ item: slot }) => {
              const sh = items[slot % items.length];
              const f = sh.funding_id ? fundingById.get(sh.funding_id) : undefined;
              const on = !!liked[sh.id];
              return (
                <View style={{ height: h, paddingHorizontal: spacing.insetL, paddingBottom: 104 }}>
                  <ShortVideo
                    url={sh.video_url}
                    durationSec={sh.duration_sec}
                    active={slot === current}
                    muted={muted}
                    loop={!cycle}
                    onEnded={() => next(slot)}
                    onToggleMute={() => setMuted(!muted)}
                  />
                  {cycle ? (
                    <View style={s.counter} pointerEvents="none">
                      <Txt v="caption2" w="semibold" c="#F3E8EE" tabular>{(slot % items.length) + 1} / {items.length}</Txt>
                    </View>
                  ) : null}
                  <View style={s.actions}>
                    {[
                      { icon: on ? 'heartF' : 'heart', label: on ? '좋아요 취소' : '좋아요', c: on ? '#F6A9BF' : color.shortsLabel, onPress: () => setLiked({ ...liked, [sh.id]: !on }) },
                      { icon: 'cmt', label: '댓글', c: color.shortsLabel, onPress: () => router.push(`/work/${sh.work_id}`) },
                      { icon: 'share', label: '공유', c: color.shortsLabel, onPress: () => undefined },
                    ].map((a) => (
                      <Pressable key={a.label} accessibilityLabel={a.label} onPress={a.onPress} style={s.act}>
                        <Icon name={a.icon} size={26} c={a.c} />
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapS }}>
                      <Txt v="body2" w="bold" c={color.shortsLabel} lines={1} style={{ flex: 1 }}>{sh.work_title}</Txt>
                      {f ? <Txt v="caption1" w="semibold" c="#F6A9BF">{ddayText(f) || '청약 중'}</Txt> : null}
                    </View>
                    <Txt v="caption1" c="rgba(243,232,238,0.7)" lines={1}>{sh.title}</Txt>
                    {f ? (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Txt v="label1" w="bold" c={color.shortsLabel} tabular>{Math.round(f.progress.achievement_pct).toLocaleString('ko-KR')}%</Txt>
                          <Txt v="caption1" c="rgba(243,232,238,0.7)">{manwon(f.progress.raised_amount)}</Txt>
                        </View>
                        <LinearProgress value={f.progress.achievement_pct} />
                        <Button
                          label="펀딩 바로가기"
                          size="Medium"
                          onPress={() => {
                            track('FUNDING_CTA', { work_id: sh.work_id, funding_id: f.id, referrer: 'shorts' });
                            router.push(`/funding/${f.id}`);
                          }}
                        />
                      </>
                    ) : (
                      <Button label="작품 보기" tone="Assistive" size="Medium" onPress={() => router.push(`/work/${sh.work_id}`)} />
                    )}
                  </View>
                </View>
              );
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { height: 56, flexDirection: 'row', alignItems: 'baseline', gap: spacing.gapM, paddingHorizontal: spacing.screen, paddingTop: 14 },
  counter: { position: 'absolute', top: 12, right: spacing.insetL + 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)' },
  actions: { position: 'absolute', right: spacing.insetL + 8, bottom: 300, gap: spacing.gapL },
  act: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', left: spacing.insetL + 12, right: spacing.insetL + 12, bottom: 116, gap: spacing.gapS, padding: spacing.insetL, borderRadius: radius.card, backgroundColor: 'rgba(14,15,23,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
});
