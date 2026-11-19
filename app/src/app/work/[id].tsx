import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Chip, Cover, CtaBar, SecH } from '@/components/dibby';
import { Button, ErrorBox, Loading, Screen, T } from '@/components/ui';
import { api, ApiError, track, type Episode, type FundingDetail, type WorkDetail } from '@/lib/api';
import { FUNDING_STATUS, won } from '@/lib/format';
import { colors, radii, space, type as ts } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

// 프로토타입 S.detail
export default function WorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload, setData } = useApi(async () => {
    const [work, episodes] = await Promise.all([api.get<WorkDetail>(`/works/${id}`), api.get<Episode[]>(`/works/${id}/episodes`)]);
    const funding = work.funding_id ? await api.get<FundingDetail>(`/fundings/${work.funding_id}`).catch(() => null) : null;
    return { work, episodes, funding };
  }, [id]);

  useEffect(() => {
    track('WORK_VIEW', { work_id: Number(id) });
  }, [id]);

  const toggleDib = async () => {
    if (!data) return;
    const on = !data.work.is_dibbed;
    setData({ ...data, work: { ...data.work, is_dibbed: on, dib_count: data.work.dib_count + (on ? 1 : -1) } }); // 낙관적 갱신
    try {
      if (on) await api.put(`/works/${id}/dib`);
      else await api.del(`/works/${id}/dib`);
    } catch (e) {
      Alert.alert('찜 실패', (e as ApiError).message);
      reload();
    }
  };

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  const { work, episodes, funding } = data;
  const fs = work.funding_status;
  const listed = !!fs && ['LISTED', 'SUSPENDED', 'MATURED'].includes(fs);

  const primary = () => {
    if (!work.funding_id || !fs) return <Button title="펀딩 준비 중" kind="ghost" onPress={() => {}} style={{ flex: 1 }} />;
    if (fs === 'OPEN') return <Button title="조각 청약" onPress={() => router.push(`/subscribe/${work.funding_id}`)} style={{ flex: 1 }} />;
    if (listed) return <Button title="조각 시세 보기" onPress={() => router.push(`/security/${work.funding_id}`)} style={{ flex: 1 }} />;
    return <Button title={`펀딩 결과 (${FUNDING_STATUS[fs]})`} kind="ghost" onPress={() => router.push(`/funding/${work.funding_id}`)} style={{ flex: 1 }} />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable accessibilityLabel="찜" onPress={toggleDib} hitSlop={10}>
              <Ionicons name={work.is_dibbed ? 'heart' : 'heart-outline'} size={24} color={work.is_dibbed ? colors.primary : colors.labelStrong} />
            </Pressable>
          ),
        }}
      />
      <Screen onRefresh={reload}>
        <Cover id={work.id} title={work.title} genre={work.genre} coverUrl={work.cover_url} style={{ height: 250, borderRadius: radii.card }} />

        <View style={{ flexDirection: 'row', gap: 6, marginTop: space(4) }}>
          <Chip label={work.genre} />
          <Chip label={work.type === 'WEBNOVEL' ? '웹소설' : '웹툰'} />
          {fs ? <Chip label={FUNDING_STATUS[fs]} tone="pink" /> : null}
        </View>
        <T size={ts.heading1.fontSize} weight="700" style={{ marginTop: space(3) }}>{work.title}</T>
        <T size={13} weight="500" color={colors.labelAlternative} style={{ marginTop: 6 }}>회차 {work.episode_count}개 공개</T>
        <T size={15} color={colors.labelNeutral} style={{ marginTop: space(3) }}>{work.synopsis || '줄거리가 아직 없어요'}</T>

        <View style={s.stats}>
          {[
            ['펀딩', funding ? `${funding.progress.achievement_pct.toLocaleString('ko-KR')}%` : '-'],
            ['관심', work.dib_count.toLocaleString('ko-KR')],
            ['회차', String(episodes.length)],
          ].map(([k, v]) => (
            <View key={k} style={{ flex: 1, alignItems: 'center' }}>
              <T size={12} weight="500" color={colors.labelAlternative}>{k}</T>
              <T size={18} weight="700" style={{ marginTop: 2 }}>{v}</T>
            </View>
          ))}
        </View>

        {funding ? (
          <>
            <SecH title="참여 방법" />
            <Pressable style={s.opt} onPress={() => router.push(`/funding/${funding.id}`)}>
              <View style={{ flex: 1 }}>
                <T size={14} weight="700">펀딩 자세히 보기</T>
                <T size={12} color={colors.labelAlternative} style={{ marginTop: 2 }}>
                  배정 방식 · 손익분기 · 작가 정산 일정{funding.days_left !== null ? ` · D-${funding.days_left}` : ''}
                </T>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.labelAssistive} />
            </Pressable>
            <Pressable style={s.opt} onPress={() => router.push(listed ? `/security/${funding.id}` : `/subscribe/${funding.id}`)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T size={14} weight="700">{listed ? '조각 거래' : '조각 청약'}</T>
                  <Chip label="모의" tone="pink" />
                </View>
                <T size={12} color={colors.labelAlternative} style={{ marginTop: 2 }}>
                  1조각 {won(funding.unit_price)} · 플랫폼 매출 수익권 · 진행 {funding.progress.achievement_pct.toLocaleString('ko-KR')}%
                </T>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.labelAssistive} />
            </Pressable>
          </>
        ) : null}

        <SecH title={`회차 ${episodes.length}`} />
        <View style={s.listCard}>
          {episodes.map((ep, i) => (
            <Pressable key={ep.id} onPress={() => router.push(`/episode/${ep.id}`)} style={[s.li, i === episodes.length - 1 && { borderBottomWidth: 0 }]}>
              <T size={14} style={{ flex: 1 }} numberOfLines={1}>{ep.no}화 · {ep.title}</T>
              {ep.is_paid && !ep.unlocked ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.highlight} />
                  <T size={12} weight="600" color={colors.highlight}>{ep.price_coin}코인</T>
                </View>
              ) : (
                <T size={12} color={colors.labelAlternative}>{ep.is_paid ? '구매함' : '무료'}</T>
              )}
            </Pressable>
          ))}
        </View>
        <T size={12} color={colors.labelAssistive} style={{ marginTop: space(3) }}>발행 전에는 모든 회차가 무료예요. 상장 후 운영자가 회차별 유료 여부를 정해요.</T>
      </Screen>
      <CtaBar>
        <Button title={work.is_dibbed ? '찜함' : '찜하기'} kind="ghost" onPress={toggleDib} style={{ flex: 1 }} />
        {primary()}
      </CtaBar>
    </View>
  );
}

const s = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: space(4), paddingVertical: space(3.5), borderRadius: radii.card, backgroundColor: colors.card },
  opt: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3.5), borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.lineStrong, marginBottom: space(2) },
  listCard: { borderRadius: radii.card, backgroundColor: colors.card, paddingHorizontal: space(4) },
  li: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(3.5), borderBottomWidth: 1, borderBottomColor: colors.line },
});
