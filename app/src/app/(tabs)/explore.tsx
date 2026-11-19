import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { ErrorBox, Loading } from '@/components/ui';
import {
  ChipRow, DisclosureBar, DScreen, Empty, Icon, InvestSummary, Section, Segmented, TopAppBar, Txt, WorkCard,
  color, radius, spacing, textStyle,
} from '@/ds';
import { api, type FundingCard, type WorkCard as Work } from '@/lib/api';
import { ddayText, fundingStatus, fundingToCard, manwon, typeLabel } from '@/lib/cards';
import { useApi } from '@/lib/useApi';

type Tab = 'recommend' | 'rank' | 'new';

// V2 05 탐색 (추천 · 랭킹 · 신작)
export default function Explore() {
  const [tab, setTab] = useState<Tab>('recommend');
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('전체');
  const { data, error, loading, reload } = useApi(
    async () => {
      const [works, fundings] = await Promise.all([
        api.get<Work[]>('/works', { sort: tab === 'new' ? 'latest' : 'dibs', limit: 60, q: q.trim() || undefined }),
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
  const hero = [...(data?.fundings ?? [])].sort((a, b) => b.progress.achievement_pct - a.progress.achievement_pct)[0];
  const heroWork = hero ? data?.works.find((w) => w.id === hero.work_id) : undefined;

  const cardOf = (w: Work) => {
    const f = fundingByWork.get(w.id);
    if (f) return fundingToCard(f, w);
    return { id: w.id, title: w.title, genre: w.genre, format: typeLabel(w.type), likes: w.dib_count, pct: 0, raised: '', status: fundingStatus(w.funding_status), dday: '', coverUrl: w.cover_url };
  };
  const open = (w: Work) => (w.funding_id ? router.push(w.funding_status === 'LISTED' ? `/security/${w.funding_id}` : `/funding/${w.funding_id}`) : router.push(`/work/${w.id}`));

  return (
    <DScreen header={<TopAppBar type="Main" />} onRefresh={reload} tabBar gap={spacing.gap2xl}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapM, height: 48, paddingHorizontal: spacing.insetL, borderRadius: radius.chip, backgroundColor: color.bgAlternative }}>
        <Icon name="search" size={20} c={color.labelAlternative} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="작품·작가 검색"
          placeholderTextColor={color.labelAssistive}
          returnKeyType="search"
          style={[textStyle('body2'), { flex: 1, color: color.labelStrong }]}
          accessibilityLabel="검색"
        />
      </View>
      {searching ? null : (
        <>
          <Segmented value={tab} onChange={setTab} options={[{ key: 'recommend', label: '추천' }, { key: 'rank', label: '랭킹' }, { key: 'new', label: '신작' }]} />
          <ChipRow items={genres} value={genre} onChange={setGenre} />
        </>
      )}
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : null}

      {searching ? (
        // 검색 중에는 검색 결과만
        <Section title={`'${q.trim()}' 검색 결과`} count={`${works.length}작품`}>
          {works.map((w, i) => <WorkCard key={w.id} data={cardOf(w)} last={i === works.length - 1} onPress={() => open(w)} />)}
        </Section>
      ) : null}

      {!searching && tab === 'recommend' && hero ? (
        <Section title="오늘의 대표 작품">
          <InvestSummary
            compact
            id={hero.work_id}
            title={hero.work_title}
            by={heroWork ? `${typeLabel(heroWork.type)} · ${heroWork.genre}` : undefined}
            status="Recruiting"
            statusText={ddayText(hero) ? `청약 중 · ${ddayText(hero)}` : '청약 중'}
            mainValue={`${Math.round(hero.progress.achievement_pct).toLocaleString('ko-KR')}%`}
            mainSub={`${manwon(hero.progress.raised_amount)} / 목표 ${manwon(hero.target_amount)}`}
            progress={hero.progress.achievement_pct}
            coverUrl={heroWork?.cover_url}
            actions={{
              left: { label: '1분 쇼츠 보기', icon: 'play', onPress: () => router.push('/shorts') },
              right: { label: '자세히 보기', icon: 'chev', onPress: () => router.push(`/funding/${hero.id}`) },
            }}
          />
        </Section>
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
        <Section title={tab === 'new' ? '새로 올라온 작품' : '추천 작품'}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.gapL, rowGap: spacing.gap2xl }}>
            {ranked.map((w) => (
              <View key={w.id} style={{ width: '48%' }}>
                <WorkCard layout="Grid" data={cardOf(w)} onPress={() => open(w)} />
              </View>
            ))}
          </View>
        </Section>
      )}
      {data && !works.length ? <Empty title="찾는 작품이 없어요" text="다른 검색어나 장르로 찾아보세요." /> : null}
      <DisclosureBar />
    </DScreen>
  );
}
