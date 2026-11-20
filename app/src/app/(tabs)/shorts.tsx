import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, LinearProgress, Txt, color, radius, spacing } from '@/ds';
import { api, track, type FundingCard, type ShortItem } from '@/lib/api';
import { ddayText, manwon } from '@/lib/cards';
import { useApi } from '@/lib/useApi';
import { ShortVideo, isPlayable } from '@/components/ShortVideo';

// 순환 재생: 마지막 다음에 처음이 오도록 목록을 여러 번 이어 붙인다
const LAPS = 50;
const FEEDS = ['추천', '팔로잉', '펀딩 중', '투자 모집 중'] as const;
const LIGHT = '#F3E8EE';
const DIM = 'rgba(243,232,238,0.72)';

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// V2 03 쇼츠 — 몰입형(하단 탭 없음, X 로 닫기). 위: 진행 막대 + 피드 탭, 오른쪽: 좋아요·댓글·공유·소리, 아래: 작품 + 펀딩 카드.
// 재생 가능한 영상이 있으면 그 영상들만 차례로 돌린다 (끝나면 다음, 마지막 다음은 처음).
export default function Shorts() {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  const [feed, setFeed] = useState<(typeof FEEDS)[number]>('추천');
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
    const base = playable.length ? playable : all;
    // 펀딩 중·투자 모집 중 탭은 모집 중인 작품만
    return feed === '펀딩 중' || feed === '투자 모집 중' ? base.filter((sh) => sh.funding_status === 'OPEN') : base;
  }, [data, feed]);
  const n = items.length;
  const cycle = n > 1;
  const slots = useMemo(() => Array.from({ length: n * (cycle ? LAPS : 1) }, (_, i) => i), [n, cycle]);
  const next = useCallback(
    (from: number) => listRef.current?.scrollToIndex({ index: Math.min(from + 1, slots.length - 1), animated: true }),
    [slots.length],
  );
  useEffect(() => {
    data?.shorts.forEach((sh) => track('SHORT_PLAY', { work_id: sh.work_id, short_id: sh.id }));
  }, [data]);
  useEffect(() => {
    setCurrent(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [feed]);

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
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
              <Txt v="body1" w="bold" c={LIGHT}>쇼츠는 곧 열려요</Txt>
              <Txt v="label2" c={DIM}>작품 하이라이트 영상을 준비하고 있어요.</Txt>
            </View>
          }
          renderItem={({ item: slot }) => {
            const sh = items[slot % n];
            const f = sh.funding_id ? fundingById.get(sh.funding_id) : undefined;
            const on = !!liked[sh.id];
            return (
              <View style={{ height: h }}>
                <ShortVideo
                  full
                  url={sh.video_url}
                  durationSec={sh.duration_sec}
                  active={slot === current}
                  muted={muted}
                  loop={!cycle}
                  onEnded={() => next(slot)}
                  onToggleMute={() => setMuted(!muted)}
                />
                <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={[s.shade, { top: 0, height: 150 + insets.top }]} />
                <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']} style={[s.shade, { bottom: 0, height: 360 }]} />

                <View style={[s.actions, { bottom: 236 + insets.bottom }]}>
                  {[
                    { icon: on ? 'heartF' : 'heart', label: on ? '찜함' : '찜', c: on ? '#F6A9BF' : LIGHT, onPress: () => setLiked({ ...liked, [sh.id]: !on }) },
                    { icon: 'cmt', label: '댓글', c: LIGHT, onPress: () => router.push(`/work/${sh.work_id}`) },
                    { icon: 'share', label: '공유', c: LIGHT, onPress: () => undefined },
                    { icon: muted ? 'volOff' : 'vol', label: muted ? '소리 켜기' : '소리 끄기', c: LIGHT, onPress: () => setMuted(!muted) },
                  ].map((a) => (
                    <Pressable key={a.label} accessibilityLabel={a.label} onPress={a.onPress} style={s.act}>
                      <Icon name={a.icon} size={28} c={a.c} />
                      <Txt v="caption2" w="semibold" c={LIGHT}>{a.label}</Txt>
                    </Pressable>
                  ))}
                </View>

                <View style={[s.bottom, { paddingBottom: insets.bottom + spacing.insetL }]}>
                  <View style={{ gap: 4, paddingRight: 64 }}>
                    <Txt v="headline1" w="bold" c={LIGHT} lines={1}>{sh.work_title}</Txt>
                    <Txt v="caption1" c={DIM} lines={1}>{`${mmss(sh.duration_sec)} 티저${f ? ` · 청약 ${ddayText(f) || '중'}` : ''}`}</Txt>
                  </View>
                  {f ? (
                    <View style={s.card}>
                      <View style={s.row}>
                        <View style={s.pill}><Txt v="caption2" w="bold" c={LIGHT}>{`공모 마감 ${ddayText(f) || '임박'}`}</Txt></View>
                        <Pressable onPress={() => router.push(`/funding/${f.id}`)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Txt v="caption1" w="semibold" c={DIM}>상세</Txt>
                          <Icon name="chev" size={14} c={DIM} />
                        </Pressable>
                      </View>
                      <View style={s.row}>
                        <Txt v="body1" w="bold" c="#F6A9BF" tabular>{`${Math.round(f.progress.achievement_pct).toLocaleString('ko-KR')}% 달성`}</Txt>
                        <Txt v="caption1" c={DIM}>{`목표 ${manwon(f.target_amount)}`}</Txt>
                      </View>
                      <LinearProgress value={f.progress.achievement_pct} />
                      <View style={[s.row, { alignItems: 'flex-end' }]}>
                        <View style={{ gap: 2 }}>
                          <Txt v="caption2" c={DIM}>모집 금액</Txt>
                          <Txt v="headline1" w="bold" c={LIGHT} tabular>{`${f.progress.raised_amount.toLocaleString('ko-KR')}원`}</Txt>
                        </View>
                        <Pressable
                          style={s.cta}
                          onPress={() => {
                            track('FUNDING_CTA', { work_id: sh.work_id, funding_id: f.id, referrer: 'shorts' });
                            router.push(`/funding/${f.id}`);
                          }}>
                          <Txt v="label1" w="bold" c={color.onPrimarySoft}>투자하기</Txt>
                          <Icon name="arrow" size={16} c={color.onPrimarySoft} />
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable style={[s.card, s.row]} onPress={() => router.push(`/work/${sh.work_id}`)}>
                      <Txt v="label1" w="semibold" c={LIGHT}>작품 보러 가기</Txt>
                      <Icon name="chev" size={18} c={DIM} />
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />
      ) : null}

      {/* 위: 진행 막대 + 피드 탭 + 닫기 (넘겨도 고정) */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        {cycle ? (
          <View style={s.stories} pointerEvents="none">
            {items.map((sh, i) => (
              <View key={sh.id} style={[s.story, { backgroundColor: i <= current % n ? LIGHT : 'rgba(243,232,238,0.32)' }]} />
            ))}
          </View>
        ) : null}
        <View style={s.feedRow}>
          {FEEDS.map((x) => (
            <Pressable key={x} onPress={() => setFeed(x)} hitSlop={6} style={{ paddingVertical: 6 }}>
              <Txt v="label1" w={feed === x ? 'bold' : 'medium'} c={feed === x ? LIGHT : DIM}>{x}</Txt>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <Pressable accessibilityLabel="쇼츠 닫기" onPress={close} hitSlop={10}>
            <Icon name="close" size={26} c={LIGHT} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  shade: { position: 'absolute', left: 0, right: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.screen, gap: spacing.gapM },
  stories: { flexDirection: 'row', gap: 4 },
  story: { flex: 1, height: 2.5, borderRadius: 2 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapL },
  actions: { position: 'absolute', right: spacing.insetM, gap: spacing.gapL, alignItems: 'center' },
  act: { alignItems: 'center', gap: 2, minWidth: 48 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.insetL, gap: spacing.gapL },
  card: { gap: spacing.gapM, padding: spacing.insetL, borderRadius: radius.card, backgroundColor: 'rgba(18,16,28,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(222,87,134,0.32)', borderWidth: 1, borderColor: 'rgba(246,169,191,0.5)' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: spacing.insetL, borderRadius: 999, backgroundColor: '#F6A9BF' },
});
