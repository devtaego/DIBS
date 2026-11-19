import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Badge, Card, ErrorBox, H2, Loading, Muted, ProgressBar, Row, Screen, T, changeColor } from '@/components/ui';
import { api, type FundingCard, type SecurityItem, type WorkCard } from '@/lib/api';
import { FUNDING_STATUS, pct, won } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Home() {
  const { data, error, loading, reload } = useApi(async () => {
    const [fundings, works, securities] = await Promise.all([
      api.get<FundingCard[]>('/fundings', { status: 'OPEN' }),
      api.get<WorkCard[]>('/works', { sort: 'dibs', limit: 20 }),
      api.get<SecurityItem[]>('/market/securities', { sort: 'change' }),
    ]);
    return { fundings, works, securities };
  });

  if (loading && !data) return <Screen><Loading /></Screen>;

  return (
    <Screen onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      <H2>오늘의 찜 IP · 펀딩 중</H2>
      {data?.fundings.length ? null : <Muted>지금 모집 중인 펀딩이 없어요</Muted>}
      {data?.fundings.map((f) => (
        <Card key={f.id} onPress={() => router.push(`/funding/${f.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="700" style={{ flex: 1 }} numberOfLines={1}>{f.work_title}</T>
            <Badge label={f.days_left !== null ? `D-${f.days_left}` : FUNDING_STATUS[f.status]} tone="accent" />
          </Row>
          <Row style={{ marginTop: space(2), alignItems: 'baseline' }}>
            <T size={26} weight="800" color={colors.accent}>{f.progress.achievement_pct.toLocaleString('ko-KR')}%</T>
            <Muted>{f.progress.participants}명 참여 · 목표 {won(f.target_amount)}</Muted>
          </Row>
          <ProgressBar pct={f.progress.achievement_pct} />
        </Card>
      ))}

      <H2>가장 많이 찜한 작품</H2>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
        {data?.works.map((w) => (
          <Card key={w.id} onPress={() => router.push(`/work/${w.id}`)} style={{ width: 168, height: 190, justifyContent: 'space-between', backgroundColor: colors.cardAlt }}>
            <View>
              <Muted>{w.genre}</Muted>
              <T weight="700" numberOfLines={3} style={{ marginTop: space(1) }}>{w.title}</T>
            </View>
            <View>
              {w.funding_status ? <Badge label={FUNDING_STATUS[w.funding_status]} tone={w.funding_status === 'OPEN' ? 'accent' : 'default'} /> : null}
              <Muted style={{ marginTop: space(1) }}>♥ {w.dib_count.toLocaleString('ko-KR')}</Muted>
            </View>
          </Card>
        ))}
      </ScrollView>

      <H2>이번 주 조각 시세</H2>
      {data?.securities.slice(0, 5).map((sec) => (
        <Card key={sec.funding_id} onPress={() => router.push(`/security/${sec.funding_id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="700" style={{ flex: 1 }} numberOfLines={1}>{sec.work_title}</T>
            <View style={{ alignItems: 'flex-end' }}>
              <T weight="700">{won(sec.last_price)}</T>
              <T size={13} color={changeColor(sec.change_pct)}>{pct(sec.change_pct, 2)}</T>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
