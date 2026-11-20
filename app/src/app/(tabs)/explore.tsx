import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import {
  ChipRow, Cover, DisclosureBar, Segmented, DScreen, Empty, Icon, IconButton, Section, Txt, WorkCard,
  color, radius, spacing, textStyle,
} from '@/ds';
import { api, type FundingCard, type WorkCard as Work } from '@/lib/api';
import { fundingStatus, fundingToCard, typeLabel } from '@/lib/cards';
import { PHASE_LABEL, phaseOf, type Phase } from '@/lib/phase';
import { useApi } from '@/lib/useApi';

type Tab = 'recommend' | 'rank';
type Mode = '전체' | '카테고리' | '필터';

// 연령대별 보기: 연령대마다 많이 보는 장르 키워드 (시연용 추정치, 실제 서비스는 이용 기록으로 계산)
const AGES: Record<string, { label: string; keys: string[] }> = {
  '10대': { label: '10대가 많이 보는', keys: ['학원', '코미디', '액션', '판타지', '게임'] },
  '20대': { label: '20대가 많이 찜한', keys: ['로맨스', '로판', '스릴러', '판타지'] },
  '30대': { label: '30대가 정주행한', keys: ['드라마', '미스터리', '오피스', '현대', '일상'] },
  '40대+': { label: '40대 이상이 고른', keys: ['무협', '역사', '사극', '힐링', '드라마'] },
};
const SORTS = ['찜 많은 순', '모집률 높은 순', '마감 임박 순'] as const;

// V2 05 탐색 (추천 · 랭킹) — 디자인 시스템 프로토타입 기준
export default function Explore() {
  const [tab, setTab] = useState<Tab>('recommend');
  const [q, setQ] = useState('');
  const params = useLocalSearchParams<{ search?: string }>();
  const [showSearch, setShowSearch] = useState(params.search === '1');
  // 다른 화면의 검색 아이콘으로 들어오면 바로 검색창을 연다
  useEffect(() => { if (params.search === '1') setShowSearch(true); }, [params.search]);
  const [genre, setGenre] = useState('전체');
  const [mode, setMode] = useState<Mode>('전체');
  const [age, setAge] = useState('20대');
  const [fmt, setFmt] = useState('전체');
  const [phase, setPhase] = useState('전체');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('찜 많은 순');
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
  const pctOf = (w: Work) => fundingByWork.get(w.id)?.progress.achievement_pct ?? -1;
  const works = (data?.works ?? []).filter((w) => {
    if (searching || tab === 'rank') return true;
    if (mode === '카테고리') return genre === '전체' ? AGES[age].keys.some((k) => w.genre.includes(k)) : w.genre === genre;
    if (mode === '필터') {
      if (fmt !== '전체' && typeLabel(w.type) !== fmt) return false;
      if (phase !== '전체' && PHASE_LABEL[phaseOf(w.funding_status)] !== phase) return false;
    }
    return true;
  });
  const ranked = useMemo(() => {
    const list = [...works];
    if (tab === 'recommend' && mode === '필터') {
      if (sort === '모집률 높은 순') list.sort((a, b) => pctOf(b) - pctOf(a));
      else if (sort === '마감 임박 순') list.sort((a, b) => (fundingByWork.get(a.id)?.days_left ?? 999) - (fundingByWork.get(b.id)?.days_left ?? 999));
    } else if (tab === 'recommend') list.sort((a, b) => Number(b.funding_status === 'OPEN') - Number(a.funding_status === 'OPEN'));
    return list;
  }, [works, tab, mode, sort]);

  const cardOf = (w: Work) => {
    const f = fundingByWork.get(w.id);
    if (f) return fundingToCard(f, w);
    return { id: w.id, title: w.title, genre: w.genre, format: typeLabel(w.type), likes: w.dib_count, pct: 0, raised: '', status: fundingStatus(w.funding_status), dday: '', coverUrl: w.cover_url };
  };
  // 공모 전(심사·승인 대기) 작품은 펀딩 페이지가 아직 공개되지 않으므로 작품 페이지로
  const open = (w: Work) => {
    const ph = phaseOf(w.funding_status);
    if (!w.funding_id || ph === 'PRE') return router.push(`/work/${w.id}`);
    return router.push(w.funding_status === 'LISTED' ? `/security/${w.funding_id}` : `/funding/${w.funding_id}`);
  };

  const openFundings = [...(data?.fundings ?? [])].sort((x, y) => (x.days_left ?? 99) - (y.days_left ?? 99));
  const closeSearch = () => { setQ(''); setShowSearch(false); router.setParams({ search: '' }); };
  const header = showSearch || searching ? (
    // 검색 중: 뒤로가기 + 검색창 (뒤로가기를 누르면 검색을 닫고 추천 화면으로)
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.gapS, paddingLeft: spacing.insetXs, paddingRight: spacing.screen }}>
      <IconButton icon="back" label="검색 닫기" onPress={closeSearch} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.gapM, height: 44, paddingHorizontal: spacing.insetL, borderRadius: radius.chip, backgroundColor: color.bgAlternative }}>
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
    </View>
  ) : (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.gapL, paddingLeft: spacing.screen, paddingRight: spacing.insetXs }}>
      {(['recommend', 'rank'] as const).map((k, i) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapL }}>
          {i > 0 ? <View style={{ width: 1.5, height: 16, borderRadius: 1, backgroundColor: color.lineNormal }} /> : null}
          <Pressable onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} hitSlop={6}>
            <Txt v="title3" w="bold" c={tab === k ? color.labelStrong : color.labelAssistive}>{k === 'recommend' ? '추천' : '랭킹'}</Txt>
          </Pressable>
        </View>
      ))}
      <View style={{ flex: 1 }} />
      <IconButton icon="cSearch" label="검색" onPress={() => setShowSearch(true)} />
      <IconButton icon="cBell" label="알림" onPress={() => router.push('/notifications')} />
    </View>
  );

  return (
    <DScreen header={header} onRefresh={reload} tabBar gap={spacing.gapXl}>
      {showSearch && !searching ? <Txt v="body2" c={color.labelAlternative}>작품 이름이나 장르로 찾아보세요.</Txt> : null}
      {showSearch || searching || tab === 'rank' ? null : (
        <View style={{ gap: spacing.gapM }}>
          <Segmented options={(['전체', '카테고리', '필터'] as const).map((k) => ({ key: k, label: k }))} value={mode} onChange={setMode} grow />
          {mode === '카테고리' ? (
            <View style={{ gap: spacing.gapS }}>
              <Txt v="label2" w="semibold" c={color.labelAlternative}>연령대별 보기</Txt>
              <ChipRow items={Object.keys(AGES)} value={genre === '전체' ? age : ''} onChange={(a) => { setAge(a); setGenre('전체'); }} />
              <Txt v="label2" w="semibold" c={color.labelAlternative}>장르</Txt>
              <ChipRow items={genres.slice(1)} value={genre} onChange={(g) => setGenre(g === genre ? '전체' : g)} />
            </View>
          ) : null}
          {mode === '필터' ? (
            <View style={{ gap: spacing.gapS }}>
              <ChipRow items={['모든 형식', '웹툰', '웹소설']} value={fmt === '전체' ? '모든 형식' : fmt} onChange={(v) => setFmt(v === '모든 형식' ? '전체' : v)} />
              <ChipRow items={['모든 단계', '공모 전', '공모 중', '공모 종료']} value={phase === '전체' ? '모든 단계' : phase} onChange={(v) => setPhase(v === '모든 단계' ? '전체' : v)} />
              <ChipRow items={[...SORTS]} value={sort} onChange={(v) => setSort(v as (typeof SORTS)[number])} />
            </View>
          ) : null}
          {mode === '카테고리' ? <Txt v="headline2" w="bold" c={color.labelStrong}>{genre === '전체' ? AGES[age].label : `${genre} 작품`}</Txt> : null}
        </View>
      )}
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}

      {searching ? (
        // 검색 중에는 검색 결과만
        <Section title={`'${q.trim()}' 검색 결과`} count={`${works.length}작품`}>
          {works.map((w, i) => <WorkCard key={w.id} data={cardOf(w)} last={i === works.length - 1} onPress={() => open(w)} />)}
        </Section>
      ) : null}

      {!searching && !showSearch && tab === 'recommend' && mode === '전체' && openFundings.length ? (
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

      {searching || showSearch ? null : tab === 'rank' ? (
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
            const ph: Phase = phaseOf(w.funding_status);
            const badge = f ? `공모 중 · ${Math.round(f.progress.achievement_pct).toLocaleString('ko-KR')}%` : ph === 'CLOSED' ? (w.funding_status === 'LISTED' ? '공모 종료 · 거래 중' : '공모 종료')
              : w.funding_status === 'APPROVED' ? '공모 예정' : `관심 ${w.dib_count.toLocaleString('ko-KR')}`;
            return (
              <Pressable key={w.id} onPress={() => open(w)} style={{ width: '47.8%', gap: spacing.gapS }}>
                <View>
                  <Cover id={w.id} title={w.title} url={w.cover_url} size="Large" />
                  <View style={[s.over, f ? { backgroundColor: 'rgba(222,87,134,0.92)' } : ph === 'CLOSED' ? { backgroundColor: 'rgba(17,120,110,0.88)' } : w.funding_status === 'APPROVED' ? { backgroundColor: 'rgba(78,64,170,0.88)' } : null]}>
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
