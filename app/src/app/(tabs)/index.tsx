import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useScreenWidth } from '@/components/PhoneFrame';
import { ErrorBox, Loading } from '@/components/ui';
import { CoverImg, DropBtn, HeadBtn, Logo, PINK, Sheet, SheetOptions, Tag, Txt, color } from '@/ds';
import { api, type FundingCard, type WorkCard } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { SafeAreaView } from 'react-native-safe-area-context';

// 04 홈 · 웹툰 / 05 홈 · 웹소설 (Screens – MVP v2)
// 오늘의 작품(넘겨 보는 큰 표지) · 실시간 랭킹 · 전체 작품(장르·정렬) · 장르별 모아보기 · 지금 펀딩 중
type Fmt = '웹툰' | '웹소설';
const GENRES = ['전체', '로맨스', '판타지', '무협', '드라마', '스릴러', '일상'];
const match = (g: string, k: string) => k === '전체' || g.includes(k) || (k === '로맨스' && g.includes('로판')) || (k === '스릴러' && g.includes('미스터리'));
const dibText = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000) / 10}만` : n.toLocaleString('ko-KR'));

export default function Home() {
  const W = useScreenWidth();
  const [fmt, setFmt] = useState<Fmt>('웹툰');
  const [genre, setGenre] = useState('전체');
  const [sort, setSort] = useState<'인기순' | '최신순'>('인기순');
  const [pick, setPick] = useState(false);
  const [slide, setSlide] = useState(0);
  const [more, setMore] = useState(false);
  const { data, error, loading, reload } = useApi(async () => {
    const [byDibs, latest, fundings] = await Promise.all([
      api.get<WorkCard[]>('/works', { sort: 'dibs', limit: 100 }),
      api.get<WorkCard[]>('/works', { limit: 100 }),
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
    ]);
    return { byDibs, latest, fundings };
  }, []);

  const type = fmt === '웹툰' ? 'WEBTOON' : 'WEBNOVEL';
  const pop = useMemo(() => (data?.byDibs ?? []).filter((w) => w.type === type), [data, type]);
  const hero = pop.filter((w) => w.cover_url).slice(0, 6);
  const rank = pop.slice(0, 10);
  const all = (sort === '인기순' ? pop : (data?.latest ?? []).filter((w) => w.type === type)).filter((w) => match(w.genre, genre));
  const tiles = GENRES.slice(1).map((g) => ({ g, list: pop.filter((w) => match(w.genre, g)) })).filter((t) => t.list.length);
  const funding = (data?.fundings ?? []).filter((f) => (f.work_type ?? 'WEBTOON') === type);
  const heroRef = useRef<FlatList>(null);
  const pageRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // 로고 = 홈 처음 상태로: 웹툰 탭 · 장르 전체 · 맨 위 (다른 화면에서 로고를 누르면 홈으로 온다)
  const goHomeTop = () => {
    setFmt('웹툰'); setGenre('전체'); setMore(false); setSlide(0);
    heroRef.current?.scrollToOffset({ offset: 0, animated: false });
    pageRef.current?.scrollTo({ y: 0, animated: true });
  };
  const HW = W - 32;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bgNormal }} edges={['top']}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8 }}>
        <Pressable onPress={goHomeTop} accessibilityRole="link" accessibilityLabel="홈 처음으로" hitSlop={8}>
          <Logo size={28} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'baseline', marginLeft: 14 }} accessibilityRole="tablist">
          {(['웹툰', '웹소설'] as Fmt[]).map((k) => (
            <Pressable key={k} onPress={() => { setFmt(k); setGenre('전체'); setMore(false); setSlide(0); heroRef.current?.scrollToOffset({ offset: 0, animated: false }); }}
              accessibilityRole="tab" accessibilityState={{ selected: fmt === k }}>
              <Txt v={fmt === k ? 'heading2' : 'headline1'} w={fmt === k ? 'bold' : 'semibold'} c={fmt === k ? color.labelStrong : color.labelAssistive}>{k}</Txt>
            </Pressable>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <HeadBtn icon="search" label="검색" onPress={() => router.push('/explore')} />
        <HeadBtn icon="bell" label="알림" onPress={() => router.push('/notifications')} />
      </View>

      <ScrollView ref={pageRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : null}

        {hero.length ? (
          <View style={{ marginHorizontal: 16, height: 430, borderRadius: 24, overflow: 'hidden', backgroundColor: color.inverseBackground,
            shadowColor: '#191F28', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 18 }, elevation: 6 }} accessibilityLabel="오늘의 작품">
            <FlatList ref={heroRef} data={hero} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(w) => String(w.id)}
              onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / HW))}
              onScroll={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / HW))} scrollEventThrottle={64}
              renderItem={({ item: w }) => (
                <Pressable onPress={() => router.push(`/work/${w.id}`)} accessibilityRole="button" accessibilityLabel={w.title} style={{ width: HW, height: 430 }}>
                  <CoverImg id={w.id} url={w.cover_url} title={w.title} w={HW} h={430} r={0} shadow={false} />
                  <LinearGradient colors={['rgba(10,8,14,0)', 'rgba(10,8,14,0.55)', 'rgba(10,8,14,0.92)']} locations={[0.38, 0.64, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
                  <View style={{ position: 'absolute', left: 22, right: 22, bottom: 24, gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Tag label={w.genre.split(' · ')[0]} tone="glass" />
                      <Tag label={w.funding_status === 'OPEN' ? '펀딩 중' : w.funding_status === 'LISTED' ? '거래 중' : '1화 무료'} />
                    </View>
                    <Txt v="title3" w="bold" c={color.white} lines={2}>{w.title}</Txt>
                    <Txt v="label2" w="medium" c="rgba(255,255,255,0.78)" lines={1}>{w.synopsis}</Txt>
                  </View>
                </Pressable>
              )} />
            <View style={{ position: 'absolute', right: 16, top: 16, height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' }}>
              <Txt v="caption1" w="semibold" c={color.white}>{Math.min(slide + 1, hero.length)} / {hero.length}</Txt>
            </View>
          </View>
        ) : null}

        {rank.length ? (
          <View style={{ paddingTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 }}>
              <Txt v="headline1" w="bold" c={color.labelStrong}>실시간 랭킹</Txt>
              <Txt v="caption1" w="medium" c={color.labelAssistive}>찜 많은 순</Txt>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
              {rank.map((w, i) => (
                <Pressable key={w.id} onPress={() => router.push(`/work/${w.id}`)} accessibilityRole="button" accessibilityLabel={`${i + 1}위 ${w.title}`} style={{ width: 128, paddingLeft: 26 }}>
                  <CoverImg id={w.id} url={w.cover_url} title={w.title} w={102} h={153} r={12} />
                  <Text style={{ position: 'absolute', left: -2, bottom: 30, fontSize: 64, lineHeight: 64, fontWeight: '800', fontStyle: 'italic', letterSpacing: -3,
                    color: color.bgNormal, textShadowColor: PINK, textShadowRadius: 1.5, textShadowOffset: { width: 0, height: 0 }, zIndex: 2 }} aria-hidden>{i + 1}</Text>
                  <Txt v="label2" w="semibold" c={color.labelStrong} lines={1} style={{ marginTop: 8 }}>{w.title}</Txt>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ paddingTop: 32, paddingHorizontal: 20 }} accessibilityLabel="전체 작품">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Txt v="headline1" w="bold" c={color.labelStrong}>전체 작품 <Txt v="label1" w="semibold" c={color.labelAssistive}>{all.length}</Txt></Txt>
            <DropBtn label={genre} onPress={() => setPick(true)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: -4, marginBottom: 14 }}>
            {(['인기순', '최신순'] as const).map((k) => (
              <Pressable key={k} onPress={() => setSort(k)} accessibilityRole="button" accessibilityState={{ selected: sort === k }}>
                <Txt v="label2" w={sort === k ? 'bold' : 'medium'} c={sort === k ? color.labelStrong : color.labelAssistive}>{k}</Txt>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 18 }}>
            {all.slice(0, more ? all.length : 12).map((w) => (
              <Pressable key={w.id} onPress={() => router.push(`/work/${w.id}`)} accessibilityRole="button" style={{ width: (W - 40 - 20) / 3 }}>
                <CoverImg id={w.id} url={w.cover_url} title={w.title} w="100%" r={10} />
                <Txt v="label2" w="semibold" c={color.labelStrong} lines={1} style={{ marginTop: 7 }}>{w.title}</Txt>
                <Txt v="caption2" w="medium" c={color.labelAssistive} lines={1}>{w.genre.split(' · ')[0]} · ♥ {dibText(w.dib_count)}</Txt>
              </Pressable>
            ))}
          </View>
          {all.length > 12 ? (
            <Pressable onPress={() => setMore(!more)} accessibilityRole="button" style={{ height: 48, marginTop: 18, borderRadius: 999, backgroundColor: color.fillNormal, alignItems: 'center', justifyContent: 'center' }}>
              <Txt v="label1" w="semibold" c={color.labelNormal}>{more ? '접기' : `전체 작품 더보기 (${all.length - 12})`}</Txt>
            </Pressable>
          ) : null}
        </View>

        {tiles.length ? (
          <View style={{ paddingTop: 36 }} accessibilityLabel="장르별 모아보기">
            <Txt v="headline1" w="bold" c={color.labelStrong} style={{ marginHorizontal: 20, marginBottom: 14 }}>장르별 모아보기</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
              {tiles.map((t) => (
                <Pressable key={t.g} onPress={() => setGenre(t.g)} accessibilityRole="button" style={{ width: 112, height: 140, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
                  <CoverImg id={t.list[0].id} url={t.list[0].cover_url} w={112} h={140} r={0} shadow={false} style={{ opacity: 0.9 }} />
                  <LinearGradient colors={['rgba(10,8,14,0)', 'rgba(10,8,14,0.78)']} locations={[0.35, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
                  <View style={{ position: 'absolute', left: 12, bottom: 12 }}>
                    <Txt v="body1" w="bold" c={color.white}>{t.g}</Txt>
                    <Txt v="caption2" w="medium" c="rgba(255,255,255,0.75)">{t.list.length}작품</Txt>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {funding.length ? (
          <View style={{ paddingTop: 36, paddingHorizontal: 20 }} accessibilityLabel="지금 펀딩 중">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Txt v="headline1" w="bold" c={color.labelStrong}>지금 펀딩 중</Txt>
              <Pressable onPress={() => router.navigate('/funding')} accessibilityRole="link"><Txt v="label2" w="semibold" c={color.labelAlternative}>전체 ›</Txt></Pressable>
            </View>
            {funding.slice(0, 5).map((f, i) => (
              <Pressable key={f.id} onPress={() => router.push(`/funding/${f.id}`)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.lineAlternative }}>
                <Txt v="body1" w="bold" c={i < 3 ? PINK : color.labelStrong} style={{ width: 18, textAlign: 'center' }} tabular>{i + 1}</Txt>
                <CoverImg id={f.work_id} url={f.cover_url} title={f.work_title} w={48} h={72} r={8} shadow={false} />
                <View style={{ flex: 1 }}>
                  <Txt v="label1" w="semibold" c={color.labelStrong} lines={1}>{f.work_title}</Txt>
                  <Txt v="caption1" w="medium" c={color.labelAssistive}>{(f.genre ?? '').split(' · ')[0]} · {f.days_left != null ? `D-${f.days_left}` : ''}</Txt>
                </View>
                <Txt v="caption1" w="bold" c={PINK} tabular>{Math.round(f.progress.achievement_pct)}%</Txt>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Sheet visible={pick} onClose={() => setPick(false)} title="장르">
        <SheetOptions items={GENRES} value={genre} onPick={(g) => { setGenre(g); setPick(false); }} />
      </Sheet>
    </SafeAreaView>
  );
}
