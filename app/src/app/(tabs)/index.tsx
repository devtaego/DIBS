import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { Chip, Cover, DEmpty, Greet, MiniWork, SecH } from '@/components/dibby';
import { ErrorBox, Loading, T, changeColor } from '@/components/ui';
import { api, type FundingCard, type SecurityItem } from '@/lib/api';
import { pct, won } from '@/lib/format';
import { colors, radii, screenPadding, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

// 프로토타입 S.home
export default function Home() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, loading, reload } = useApi(async () => {
    const [fundings, securities] = await Promise.all([
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
      api.get<SecurityItem[]>('/market/securities', { sort: 'change' }),
    ]);
    return { fundings, securities };
  });

  const fundings = [...(data?.fundings ?? [])].sort((a, b) => (a.days_left ?? 99) - (b.days_left ?? 99));
  const soon = fundings.filter((f) => f.days_left !== null && f.days_left <= 3).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.hdr}>
        <T size={26} weight="700" color={colors.primary} style={{ flex: 1, fontStyle: 'italic', letterSpacing: -0.5 }}>Dibs</T>
        <Pressable accessibilityLabel="검색" onPress={() => router.push('/explore')} style={s.ibtn}>
          <Ionicons name="search-outline" size={24} color={colors.labelStrong} />
        </Pressable>
        <Pressable accessibilityLabel="알림" onPress={() => router.push('/notifications')} style={s.ibtn}>
          <Ionicons name="notifications-outline" size={24} color={colors.labelStrong} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
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
        <Greet pose="hello" title="오늘도 먼저 찜하러 왔군요!" text={`지금 열린 청약 ${fundings.length}건${soon ? ` · 마감 임박 ${soon}건` : ''}이 있어요.`} />
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : null}

        <SecH
          title="마감 임박 펀딩"
          right={
            <Pressable onPress={() => router.push('/explore')} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T size={13} weight="500" color={colors.labelAlternative}>전체</T>
              <Ionicons name="chevron-forward" size={16} color={colors.labelAlternative} />
            </Pressable>
          }
        />
        {data && !fundings.length ? <DEmpty pose="sleep" title="지금 모집 중인 펀딩이 없어요" text="새 청약이 열리면 디비가 먼저 알려드릴게요." /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }} style={{ marginHorizontal: -screenPadding }}>
          <View style={{ width: screenPadding - space(3) }} />
          {fundings.map((f) => (
            <Pressable key={f.id} onPress={() => router.push(`/funding/${f.id}`)} style={{ width: 132 }}>
              <Cover id={f.work_id} title={f.work_title} style={{ width: 132, aspectRatio: 2 / 3, borderRadius: radii.card }} />
              <T size={14} weight="700" numberOfLines={1} style={{ marginTop: space(2) }}>{f.work_title}</T>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <T size={12} weight="600" color={colors.primary}>{f.progress.achievement_pct.toLocaleString('ko-KR')}% 달성</T>
                <T size={12} weight="600" color={colors.labelAlternative}>{f.days_left !== null ? `D-${f.days_left}` : ''}</T>
              </View>
            </Pressable>
          ))}
          <View style={{ width: screenPadding - space(3) }} />
        </ScrollView>

        <SecH title="청약 진행 중" right={<Chip label="모의" tone="pink" />} />
        <View style={s.listCard}>
          {fundings.slice(0, 3).map((f, i) => (
            <Pressable key={f.id} onPress={() => router.push(`/funding/${f.id}`)} style={[s.li, i === Math.min(2, fundings.length - 1) && { borderBottomWidth: 0 }]}>
              <MiniWork
                id={f.work_id}
                title={f.work_title}
                line2={`1조각 ${won(f.unit_price)} · 진행 ${f.progress.achievement_pct.toLocaleString('ko-KR')}%`}
                right={<Ionicons name="chevron-forward" size={20} color={colors.labelAssistive} />}
              />
            </Pressable>
          ))}
          {data && !fundings.length ? <T size={13} color={colors.labelAlternative} style={{ paddingVertical: space(4) }}>진행 중인 청약이 없어요</T> : null}
        </View>

        <SecH title="이번 주 조각 시세" right={<Chip label="모의" tone="pink" />} />
        <View style={s.listCard}>
          {data?.securities.slice(0, 5).map((sec, i, arr) => (
            <Pressable key={sec.funding_id} onPress={() => router.push(`/security/${sec.funding_id}`)} style={[s.li, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <MiniWork
                id={sec.work_id}
                title={sec.work_title}
                line2={`공모가 ${won(sec.unit_price)}`}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <T size={14} weight="700">{won(sec.last_price)}</T>
                    <T size={12} weight="600" color={changeColor(sec.change_pct)}>{pct(sec.change_pct, 2)}</T>
                  </View>
                }
              />
            </Pressable>
          ))}
          {data && !data.securities.length ? <T size={13} color={colors.labelAlternative} style={{ paddingVertical: space(4) }}>상장된 종목이 아직 없어요</T> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hdr: { height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: screenPadding, paddingRight: space(2) },
  ibtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  listCard: { borderRadius: radii.card, backgroundColor: colors.card, paddingHorizontal: space(4), paddingVertical: 2 },
  li: { paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.line },
});
