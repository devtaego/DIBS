import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Chip, Cover, CtaBar, SecH } from '@/components/dibby';
import { Button, ErrorBox, Loading, Screen, T } from '@/components/ui';
import { api, ApiError, track, type Episode, type FundingDetail, type WorkDetail } from '@/lib/api';
import { FUNDING_STATUS, won } from '@/lib/format';
import { colors, radii, space, type as ts } from '@/lib/theme';
import { nowMs } from '@/lib/now';
import { shareWork } from '@/lib/share';
import { useApi } from '@/lib/useApi';

// 프로토타입 S.detail
export default function WorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState('');
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
  const listed = !!fs && ['LISTED', 'SUSPENDED', 'TERMINATED'].includes(fs);

  const primary = () => {
    if (!work.funding_id || !fs || ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'].includes(fs)) {
      // 공모 전: 하트(찜)로 공모 시작 알림을 받는다
      const upcoming = fs === 'APPROVED';
      return <Button title={work.is_dibbed ? (upcoming ? '공모 예정 · 열리면 알려 드려요' : '공모 전 · 찜한 작품이에요') : (upcoming ? '공모 예정 · 찜하고 알림 받기' : '공모 전 · 찜하고 알림 받기')}
        kind="ghost" onPress={() => { if (!work.is_dibbed) toggleDib(); }} style={{ flex: 1 }} />;
    }
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
            <View style={{ flexDirection: 'row', gap: 18, paddingRight: 4 }}>
              <Pressable accessibilityLabel="작품 링크 공유" onPress={async () => { const m = await shareWork(work.id, work.title); if (m) { setNote(m); setTimeout(() => setNote(''), 1800); } }} hitSlop={10}>
                <Ionicons name="share-outline" size={23} color={colors.labelStrong} />
              </Pressable>
              <Pressable accessibilityLabel={work.is_dibbed ? '찜 해제' : '찜하기'} accessibilityState={{ selected: work.is_dibbed }} onPress={toggleDib} hitSlop={10}>
                <Ionicons name={work.is_dibbed ? 'heart' : 'heart-outline'} size={24} color={work.is_dibbed ? colors.primary : colors.labelStrong} />
              </Pressable>
            </View>
          ),
        }}
      />
      {note ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 0, right: 0, zIndex: 10, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(25,31,40,0.88)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 }}>
            <T size={13} weight="600" color="#fff">{note}</T>
          </View>
        </View>
      ) : null}
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
            ['펀딩', funding?.progress ? `${funding.progress.achievement_pct.toLocaleString('ko-KR')}%` : '-'],
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
                  배정 방식 · 손익분기 · 작가 정산 일정{funding.status === 'OPEN' && funding.close_at ? ` · D-${Math.max(0, Math.ceil((Date.parse(funding.close_at + '+09:00') - nowMs()) / 86_400_000))}` : ''}
                </T>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.labelAssistive} />
            </Pressable>
            {/* 청약·거래는 아래 버튼 하나로 (같은 기능 중복 제거) */}
          </>
        ) : null}

        <SecH title={`회차 ${episodes.length}`} />
        <View style={s.listCard}>
          {episodes.map((ep, i) => (
            <Pressable key={ep.id} onPress={() => router.push(`/episode/${ep.id}`)} style={[s.li, i === episodes.length - 1 && { borderBottomWidth: 0 }]}>
              <T size={14} style={{ flex: 1 }} numberOfLines={1}>{ep.title === `${ep.no}화` ? ep.title : `${ep.no}화 · ${ep.title}`}</T>
              {ep.is_paid && !ep.unlocked ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.highlight} />
                  <T size={12} weight="600" color={colors.highlight}>{ep.price_coin}코인</T>
                </View>
              ) : (
                <T size={12} color={colors.labelAlternative}>{ep.is_paid ? '구매함' : ep.paid_preview ? '무료 전환' : '무료'}</T>
              )}
            </Pressable>
          ))}
        </View>
        <T size={12} color={colors.labelAssistive} style={{ marginTop: space(3) }}>1~3화는 파일럿이라 무료예요. 4화부터는 미리보기(회당 300원)이고, 공개 21일 뒤 무료로 풀려요.</T>
      </Screen>
      <CtaBar>
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
