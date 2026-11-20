import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import {
  ChipRow, Cover, DisclosureBar, DScreen, Empty, Icon, IconButton, Section, Txt, WorkCard,
  color, radius, spacing, textStyle,
} from '@/ds';
import { api, type FundingCard, type WorkCard as Work } from '@/lib/api';
import { fundingStatus, fundingToCard, typeLabel } from '@/lib/cards';
import { useApi } from '@/lib/useApi';

type Tab = 'recommend' | 'rank';

// V2 05 탐색 (추천 · 랭킹) — 디자인 시스템 프로토타입 기준
export default function Explore() {
  const [tab, setTab] = useState<Tab>('recommend');
  const [q, setQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [genre, setGenre] = useState('전체');
  const { data, error, loading, reload } = useApi(
    async () => {
      const [works, fundings] = await Promise.all([
        api.get<Work[]>('/works', { sort: 'dibs', limit: 60, q: q.trim() || undefined }),
        api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
      ]);
      return { works, fundings };
    },
    [tab, q],
  );

  const fundingByWork = useMemo(() => new Map((data?.fundings ?? []).map((f) => [f.work_id, f])), [data]);
  const genres = useMemo(() => ['전체', ...Array.from(new Set((data?.works ?? []).map((w) => w.genre).filter(Boolean))).slice(0, 6)], [data]);
  const searching = q.trim().length > 0;
  const works = (data?.works ?? []).filter((w) => searching || genre === '전체' || w.genre === genre);
  const ranked = useMemo(() => {
    const list = [...works];
    if (tab === 'recommend') list.sort((a, b) => Number(b.funding_status === 'OPEN') - Number(a.funding_status === 'OPEN'));
    return list;
  }, [works, tab]);

  const cardOf = (w: Work) => {
    const f = fundingByWork.get(w.id);
    if (f) return fundingToCard(f, w);
    return { id: w.id, title: w.title, genre: w.genre, format: typeLabel(w.type), likes: w.dib_count, pct: 0, raised: '', status: fundingStatus(w.funding_status), dday: '', coverUrl: w.cover_url };
  };
  const open = (w: Work) => (w.funding_id ? router.push(w.funding_status === 'LISTED' ? `/security/${w.funding_id}` : `/funding/${w.funding_id}`) : router.push(`/work/${w.id}`));

  const openFundings = [...(data?.fundings ?? [])].sort((x, y) => (x.days_left ?? 99) - (y.days_left ?? 99));
  const header = (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, paddingLeft: spacing.screen, paddingRight: spacing.insetXs }}>
      {(['recommend', 'rank'] as const).map((k) => (
        <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} hitSlop={6}>
          <Txt v="title3" w="bold" c={tab === k ? color.labelStrong : color.labelAssistive}>{k === 'recommend' ? '추천' : '랭킹'}</Txt>
        </Pressable>
      ))}
      <View style={{ flex: 1 }} />
      <IconButton icon="cSearch" label="검색" onPress={() => setShowSearch(!showSearch)} />
      <IconButton icon="cBell" label="알림" onPress={() => router.push('/notifications')} />
    </View>
  );

  return (
    <DScreen header={header} onRefresh={reload} tabBar gap={spacing.gapXl}>
      {showSearch || searching ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapM, height: 48, paddingHorizontal: spacing.insetL, borderRadius: radius.chip, backgroundColor: color.bgAlternative }}>
          <Icon name="search" size={20} c={color.labelAlternative} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="작품·작가 검색"
            placeholderTextColor={color.labelAssistive}
            returnKeyType="search"
            style={[textStyle('body2'), { flex: 1, color: color.labelStrong }]}
            accessibilityLabel="검색어"
          />
          {q ? <IconButton icon="close" label="검색어 지우기" onPress={() => setQ('')} /> : null}
        </View>
      ) : null}
      {searching ? null : <ChipRow items={genres} value={genre} onChange={setGenre} />}
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}

      {searching ? (
        // 검색 중에는 검색 결과만
        <Section title={`'${q.trim()}' 검색 결과`} count={`${works.length}작품`}>
          {works.map((w, i) => <WorkCard key={w.id} data={cardOf(w)} last={i === works.length - 1} onPress={() => open(w)} />)}
        </Section>
      ) : null}

      {!searching && tab === 'recommend' && openFundings.length ? (
        // 배너: 지금 청약이 열린 작품들
        <Pressable onPress={() => router.push(`/funding/${openFundings[0].id}`)} style={s.banner}>
          <View style={{ flex: 1, gap: spacing.gapM }}>
            <Txt v="headline1" w="bold" c={color.labelStrong}>{'지금, 청약이\n열렸어요'}</Txt>
            <View style={s.bannerBtn}>
              <Txt v="caption1" w="bold" c={color.onPrimarySoft}>청약 보러 가기</Txt>
              <Icon name="chev" size={14} c={color.onPrimarySoft} />
            </View>
          </View>
          <View style={{ width: 132, height: 104 }}>
            {openFundings.slice(0, 3).map((f, i) => {
              const w = data?.works.find((x) => x.id === f.work_id);
              return (
                <View key={f.id} style={[s.stack, { left: i * 34, top: i % 2 ? 0 : 8, transform: [{ rotate: `${(i - 1) * 6}deg` }], zIndex: 3 - i }]}>
                  <Cover id={f.work_id} title={f.work_title} url={w?.cover_url} size="Small" />
                </View>
              );
            })}
            <View style={s.count}><Txt v="caption2" w="bold" c={color.white}>{`${openFundings.length}건`}</Txt></View>
          </View>
        </Pressable>
      ) : null}

      {searching ? null : tab === 'rank' ? (
        <Section title="찜 많은 순" count={`${ranked.length}작품`}>
          {ranked.map((w, i) => (
            <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapL }}>
              <Txt v="headline1" w="bold" c={i < 3 ? color.highlight : color.labelAlternative} style={{ width: 24, textAlign: 'center' }} tabular>{i + 1}</Txt>
              <View style={{ flex: 1 }}><WorkCard data={cardOf(w)} last={i === ranked.length - 1} onPress={() => open(w)} /></View>
            </View>
          ))}
        </Section>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.gapL, rowGap: spacing.gapXl }}>
          {ranked.map((w) => {
            const f = fundingByWork.get(w.id);
            const badge = f ? `모집 ${Math.round(f.progress.achievement_pct).toLocaleString('ko-KR')}%` : w.funding_status === 'LISTED' ? '거래 중' : `관심 ${w.dib_count.toLocaleString('ko-KR')}`;
            return (
              <Pressable key={w.id} onPress={() => open(w)} style={{ width: '47.8%', gap: spacing.gapS }}>
                <View>
                  <Cover id={w.id} title={w.title} url={w.cover_url} size="Large" />
                  <View style={[s.over, f && { backgroundColor: 'rgba(222,87,134,0.92)' }]}>
                    <Icon name={f ? 'trend' : w.funding_status === 'LISTED' ? 'candle' : 'star'} size={12} c={color.white} />
                    <Txt v="caption2" w="bold" c={color.white}>{badge}</Txt>
                  </View>
                </View>
                <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{w.title}</Txt>
                <Txt v="caption1" c={color.labelAlternative} lines={1}>{`${typeLabel(w.type)} · ${w.genre}`}</Txt>
              </Pressable>
            );
          })}
        </View>
      )}
      {data && !works.length ? <Empty title="찾는 작품이 없어요" text="다른 검색어나 장르로 찾아보세요." /> : null}
      <DisclosureBar />
    </DScreen>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, padding: spacing.insetXl, borderRadius: radius.card, backgroundColor: color.bgAlternative, overflow: 'hidden' },
  bannerBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, paddingHorizontal: 12, height: 32, borderRadius: 999, backgroundColor: color.primarySoft },
  stack: { position: 'absolute', width: 64, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: color.white },
  count: { position: 'absolute', right: 0, bottom: -6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(25,31,40,0.72)' },
  over: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(25,31,40,0.72)' },
});
