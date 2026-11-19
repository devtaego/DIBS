import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExploreCard } from '@/components/ExploreCard';
import { Empty, ErrorBox, Loading, T } from '@/components/ui';
import { api, type FundingCard, type WorkCard } from '@/lib/api';
import { colors, radii, screenPadding, space, type as ts } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

type Tab = 'recommend' | 'ranking' | 'new';
const TABS: { key: Tab; label: string }[] = [
  { key: 'recommend', label: '추천' },
  { key: 'ranking', label: '랭킹' },
  { key: 'new', label: '신작' },
];

// 디자인 '06 탐색' 화면
export default function Explore() {
  const [tab, setTab] = useState<Tab>('recommend');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, error, loading, reload } = useApi(
    async () => {
      const [works, fundings] = await Promise.all([
        api.get<WorkCard[]>('/works', { sort: tab === 'new' ? 'latest' : 'dibs', limit: 40, q: q.trim() || undefined }),
        api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
      ]);
      return { works, fundings };
    },
    [tab, q],
  );

  const pctByFunding = useMemo(() => new Map(data?.fundings.map((f) => [f.id, f.progress.achievement_pct]) ?? []), [data]);
  const works = useMemo(() => {
    const list = [...(data?.works ?? [])];
    // 추천: 지금 청약 중인 작품을 먼저, 그다음 찜 많은 순
    if (tab === 'recommend') list.sort((a, b) => Number(b.funding_status === 'OPEN') - Number(a.funding_status === 'OPEN'));
    return list;
  }, [data, tab]);
  const banner = data?.fundings[0];

  const statOf = (w: WorkCard) => {
    if (w.funding_status === 'OPEN' && w.funding_id && pctByFunding.has(w.funding_id)) {
      return { stat: `모집 ${pctByFunding.get(w.funding_id)!.toLocaleString('ko-KR')}%`, icon: 'trending-up' as const };
    }
    if (w.funding_status === 'LISTED') return { stat: '상장', icon: 'stats-chart' as const };
    return { stat: `관심 ${w.dib_count.toLocaleString('ko-KR')}`, icon: 'star' as const };
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <View role="tablist" style={s.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} role="tab" aria-selected={tab === t.key} onPress={() => setTab(t.key)}>
              <T size={ts.title3.fontSize} weight="700" color={tab === t.key ? colors.labelStrong : colors.labelAssistive}>{t.label}</T>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityLabel="검색" onPress={() => setSearching((v) => !v)} style={s.iconBtn}>
          <Ionicons name={searching ? 'close' : 'search-outline'} size={24} color={colors.labelStrong} />
        </Pressable>
        <Pressable accessibilityLabel="알림" onPress={() => router.push('/notifications')} style={s.iconBtn}>
          <Ionicons name="notifications-outline" size={24} color={colors.labelStrong} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            tintColor={colors.primary}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }>
        {searching ? (
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder="작품 제목"
            placeholderTextColor={colors.labelAssistive}
            returnKeyType="search"
            style={s.search}
          />
        ) : null}

        {banner && !searching ? (
          <Pressable onPress={() => router.push(`/funding/${banner.id}`)} style={s.banner}>
            <View style={{ gap: space(3), maxWidth: '64%' }}>
              <T size={ts.heading1.fontSize} weight="700">{'지금, 청약이\n열렸어요'}</T>
              <View style={s.bannerCta}>
                <T size={13} weight="700" color={colors.onPrimary}>청약 보러 가기</T>
                <Ionicons name="chevron-forward" size={14} color={colors.onPrimary} />
              </View>
            </View>
            <View style={s.bannerSide}>
              <T size={12} weight="500" color={colors.labelAlternative} numberOfLines={2} style={{ textAlign: 'right' }}>{banner.work_title}</T>
              <T size={22} weight="700" color={colors.highlight}>{banner.progress.achievement_pct.toLocaleString('ko-KR')}%</T>
              <T size={11} color={colors.labelAssistive}>{banner.days_left !== null ? `마감 D-${banner.days_left}` : '모집 중'}</T>
            </View>
          </Pressable>
        ) : null}

        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : null}
        {data && works.length === 0 ? <Empty text={q ? '찾는 작품이 없어요' : '공개된 작품이 아직 없어요'} /> : null}

        <View style={s.grid}>
          {works.map((w, i) => {
            const st = statOf(w);
            return (
              <View key={w.id} style={s.cell}>
                <ExploreCard
                  id={w.id}
                  title={w.title}
                  meta={[w.genre, w.type === 'WEBNOVEL' ? '웹소설' : '웹툰'].filter(Boolean).join(' · ')}
                  stat={st.stat}
                  statIcon={st.icon}
                  coverUrl={w.cover_url}
                  isNew={tab === 'new' && i < 3}
                  rank={tab === 'ranking' ? i + 1 : undefined}
                  onPress={() => router.push(`/work/${w.id}`)}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: space(4), paddingLeft: screenPadding, paddingRight: space(2) },
  tabs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(4) },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: screenPadding, paddingTop: space(1), paddingBottom: 120, gap: space(4) },
  search: { height: 44, borderRadius: radii.control, backgroundColor: colors.bgAlternative, paddingHorizontal: space(4), fontSize: 15, color: colors.labelStrong },
  banner: {
    height: 144,
    borderRadius: radii.card,
    backgroundColor: colors.elevatedStrong,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerCta: { alignSelf: 'flex-start', height: 32, paddingHorizontal: space(3), borderRadius: radii.chip, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 2 },
  bannerSide: { alignItems: 'flex-end', gap: 2, maxWidth: '34%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space(1.5), rowGap: space(5) },
  cell: { width: '50%', paddingHorizontal: space(1.5) },
});
