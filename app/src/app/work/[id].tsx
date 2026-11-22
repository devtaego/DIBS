import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBox, Loading } from '@/components/ui';
import { CoverImg, HeadBtn, Icon, PINK, SeedChip, Txt, UnderTabs, color, pctText, wonText } from '@/ds';
import { api, ApiError, track, type Episode, type FundingDetail, type SecurityItem, type WorkDetail } from '@/lib/api';
import { FUNDING_STATUS } from '@/lib/format';
import { imageSource } from '@/lib/media';
import { shareWork } from '@/lib/share';
import { useApi } from '@/lib/useApi';

// 07 작품 상세 (Screens – MVP v2): 흐린 표지 배경 + 가운데 표지 · 첫화 보기 · 회차 목록 · 아래 IP토큰/펀딩 바로가기
type Tab = '회차' | '작품소개';
const dibText = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000) / 10}만` : n.toLocaleString('ko-KR'));

export default function WorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('회차');
  const [note, setNote] = useState('');
  const { data, error, loading, reload, setData } = useApi(async () => {
    const [work, episodes] = await Promise.all([api.get<WorkDetail>(`/works/${id}`), api.get<Episode[]>(`/works/${id}/episodes`)]);
    // 모집 시작 전(심사 중·공모 예정) 펀딩은 서버가 상세를 공개하지 않으므로 부르지 않는다
    const fundingPublic = !!work.funding_status && !['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED'].includes(work.funding_status);
    const funding = work.funding_id && fundingPublic ? await api.get<FundingDetail>(`/fundings/${work.funding_id}`).catch(() => null) : null;
    const listed = !!work.funding_status && ['LISTED', 'SUSPENDED'].includes(work.funding_status);
    const sec = listed && work.funding_id ? await api.get<SecurityItem>(`/market/securities/${work.funding_id}`).catch(() => null) : null;
    return { work, episodes, funding, sec };
  }, [id]);

  useEffect(() => { track('WORK_VIEW', { work_id: Number(id) }); }, [id]);

  const toggleDib = async () => {
    if (!data) return;
    const on = !data.work.is_dibbed;
    setData({ ...data, work: { ...data.work, is_dibbed: on, dib_count: data.work.dib_count + (on ? 1 : -1) } });
    try {
      if (on) await api.put(`/works/${id}/dib`);
      else await api.del(`/works/${id}/dib`);
      if (on) { setNote('찜했어요 · 펀딩이 열리면 알려 드릴게요'); setTimeout(() => setNote(''), 1800); }
    } catch (e) {
      setNote(`찜하지 못했어요 · ${(e as ApiError).message}`); setTimeout(() => setNote(''), 2600);
      reload();
    }
  };

  if (loading && !data) return <SafeAreaView style={{ flex: 1, backgroundColor: color.bgNormal }}><Loading /></SafeAreaView>;
  if (!data) return <SafeAreaView style={{ flex: 1, backgroundColor: color.bgNormal }}><ErrorBox error={error} onRetry={reload} /></SafeAreaView>;
  const { work, episodes, funding, sec } = data;
  const fs = work.funding_status;
  const first = episodes[0];
  const sorted = [...episodes].sort((a, b) => b.no - a.no);
  const status = fs === 'OPEN' ? '펀딩 중' : fs === 'LISTED' ? '거래 중' : '연재중';

  return (
    <View style={{ flex: 1, backgroundColor: color.bgNormal }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: 352, overflow: 'hidden' }}>
          {imageSource(work.cover_url) ? (
            <Image source={imageSource(work.cover_url)} blurRadius={26} resizeMode="cover" style={{ position: 'absolute', top: -30, left: -30, right: -30, bottom: -30, opacity: 0.9 }} />
          ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#3A2A33' }]} />}
          <LinearGradient colors={['rgba(10,8,14,0.35)', 'rgba(10,8,14,0.15)', color.bgNormal]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={['top']}>
            <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
              <HeadBtn icon="back" label="뒤로" c={color.white} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
              <HeadBtn icon="share" label="작품 링크 공유" c={color.white} onPress={async () => { const m = await shareWork(work.id, work.title); if (m) { setNote(m); setTimeout(() => setNote(''), 1800); } }} />
            </View>
            <View style={{ alignItems: 'center', marginTop: 4 }}>
              <CoverImg id={work.id} url={work.cover_url} title={work.title} w={152} h={228} r={14} style={{ shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 16 } }} />
            </View>
          </SafeAreaView>
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 16, alignItems: 'center', gap: 6 }}>
          <Txt v="heading1" w="bold" c={color.labelStrong} center>{work.title}</Txt>
          <Txt v="label2" w="medium" c={color.labelAlternative} center>{work.genre} · {work.type === 'WEBNOVEL' ? '웹소설' : '웹툰'} · {status}</Txt>
          <Txt v="label2" w="semibold" c={color.labelNeutral} center>관심 {dibText(work.dib_count)} <Txt v="label2" c={color.labelDisable}>·</Txt> 회차 {work.episode_count}</Txt>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 18 }}>
          <Pressable onPress={() => first && router.push(`/episode/${first.id}`)} accessibilityRole="button" disabled={!first}
            style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 999, backgroundColor: '#F6A9BF', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Txt v="body1" w="bold" c="#5B1A33">첫화 무료보기</Txt>
          </Pressable>
          <Pressable onPress={toggleDib} accessibilityRole="button" accessibilityLabel={work.is_dibbed ? '관심 해제' : '관심 등록'} accessibilityState={{ selected: work.is_dibbed }}
            style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: color.fillNormal, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={work.is_dibbed ? 'heartF' : 'heart'} size={24} c={work.is_dibbed ? PINK : color.labelStrong} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
          <UnderTabs items={[`회차` as Tab, '작품소개']} value={tab} onChange={setTab} />
        </View>

        {tab === '회차' ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 4 }}>
            {sorted.map((ep) => {
              const locked = ep.is_paid && !ep.unlocked;
              return (
                <Pressable key={ep.id} onPress={() => router.push(`/episode/${ep.id}`)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                  <CoverImg id={work.id} url={work.cover_url} w={72} h={44} r={8} shadow={false} />
                  <View style={{ flex: 1 }}>
                    <Txt v="body2" w="semibold" c={color.labelStrong} lines={1}>{ep.title === `${ep.no}화` ? ep.title : `${ep.no}화 · ${ep.title}`}</Txt>
                    <Txt v="caption1" c={color.labelAssistive}>{ep.is_paid ? (ep.unlocked ? '구매함' : '미리보기') : ep.paid_preview ? '무료 전환' : '무료 회차'}</Txt>
                  </View>
                  {locked ? <SeedChip n={Math.round(ep.price_coin / 100)} /> : <Txt v="caption1" w="bold" c={ep.is_paid ? color.labelAlternative : PINK}>{ep.is_paid ? '열람 가능' : '무료'}</Txt>}
                </Pressable>
              );
            })}
            <Txt v="caption1" c={color.labelAssistive} style={{ marginTop: 8 }}>상장 전 공개 회차는 무료예요. 상장 뒤 미리보기는 회당 씨앗 3개이고, 정식 공개되면 무료로 풀려요.</Txt>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 24, paddingTop: 16, gap: 16 }}>
            <Txt v="body2" c={color.labelNeutral}>{work.synopsis || '줄거리가 아직 없어요'}</Txt>
            {funding ? (
              <Pressable onPress={() => router.push(`/funding/${funding.id}`)} accessibilityRole="button"
                style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: color.lineAlternative, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt v="label1" w="bold" c={color.labelStrong}>펀딩 · {FUNDING_STATUS[funding.status] ?? funding.status}</Txt>
                  <Txt v="caption1" c={color.labelAlternative}>달성률 {Math.round(funding.progress.achievement_pct)}% · 목표 {wonText(funding.target_amount)}</Txt>
                </View>
                <Icon name="chev" size={18} c={color.labelAssistive} />
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>

      {sec ? (
        <Pressable onPress={() => router.push(`/security/${sec.funding_id}`)} accessibilityRole="button" accessibilityLabel="IP토큰 시세 보기" style={st.bar}>
          <View style={st.tag}><Txt v="caption1" w="bold" c={PINK}>IP토큰</Txt></View>
          <Txt v="label1" w="semibold" c={color.labelStrong} style={{ flex: 1 }} tabular>{wonText(sec.last_price ?? sec.unit_price)}</Txt>
          <Txt v="label1" w="bold" c={(sec.change_pct ?? 0) >= 0 ? color.rise : color.fall} tabular>{pctText(sec.change_pct, 1)}</Txt>
          <Icon name="chev" size={18} c={color.labelAssistive} />
        </Pressable>
      ) : funding && fs === 'OPEN' ? (
        <Pressable onPress={() => router.push(`/funding/${funding.id}`)} accessibilityRole="button" accessibilityLabel="펀딩 보기" style={st.bar}>
          <View style={st.tag}><Txt v="caption1" w="bold" c={PINK}>펀딩 중</Txt></View>
          <Txt v="label1" w="semibold" c={color.labelStrong} style={{ flex: 1 }}>{Math.round(funding.progress.achievement_pct)}% 달성</Txt>
          <Txt v="label1" w="bold" c={PINK}>참여하기</Txt>
          <Icon name="chev" size={18} c={color.labelAssistive} />
        </Pressable>
      ) : null}

      {note ? (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(25,31,40,0.88)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 }}>
            <Txt v="label2" w="semibold" c={color.white}>{note}</Txt>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { position: 'absolute', left: 20, right: 20, bottom: 30, height: 56, borderRadius: 16, backgroundColor: color.elevatedNormal, borderWidth: 1, borderColor: color.lineAlternative,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, shadowColor: '#191F28', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  tag: { height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: color.highlightFill, justifyContent: 'center' },
});
