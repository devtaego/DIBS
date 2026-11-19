import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, LinearProgress, Txt, color, radius, spacing } from '@/ds';
import { api, track, type FundingCard, type ShortItem } from '@/lib/api';
import { ddayText, manwon } from '@/lib/cards';
import { useApi } from '@/lib/useApi';
import { ShortVideo } from '@/components/ShortVideo';

// V2 03 쇼츠 (전 화면 중 유일한 다크) — 세로로 넘기는 1분 하이라이트 + 펀딩 바로가기 카드
export default function Shorts() {
  const [h, setH] = useState(0);
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const { data } = useApi(async () => {
    const [shorts, fundings] = await Promise.all([
      api.get<ShortItem[]>('/shorts/feed', { limit: 20 }),
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
    ]);
    return { shorts, fundings };
  });
  const fundingById = useMemo(() => new Map((data?.fundings ?? []).map((f) => [f.id, f])), [data]);
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
            data={data?.shorts ?? []}
            keyExtractor={(x) => String(x.id)}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ height: h, alignItems: 'center', justifyContent: 'center', gap: spacing.gapM }}>
                <Txt v="body1" w="bold" c={color.shortsLabel}>쇼츠는 곧 열려요</Txt>
                <Txt v="label2" c="rgba(243,232,238,0.6)">작품 하이라이트 영상을 준비하고 있어요.</Txt>
              </View>
            }
            renderItem={({ item: sh }) => {
              const f = sh.funding_id ? fundingById.get(sh.funding_id) : undefined;
              const on = !!liked[sh.id];
              return (
                <View style={{ height: h, paddingHorizontal: spacing.insetL, paddingBottom: 104 }}>
                  <ShortVideo url={sh.video_url} durationSec={sh.duration_sec} />
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
  actions: { position: 'absolute', right: spacing.insetL + 8, bottom: 300, gap: spacing.gapL },
  act: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', left: spacing.insetL + 12, right: spacing.insetL + 12, bottom: 116, gap: spacing.gapS, padding: spacing.insetL, borderRadius: radius.card, backgroundColor: 'rgba(14,15,23,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
});
