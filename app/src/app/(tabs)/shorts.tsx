import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, Empty, ErrorBox, Loading, Muted, Row, Screen, T } from '@/components/ui';
import { api, track, type ShortItem } from '@/lib/api';
import { FUNDING_STATUS } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Shorts() {
  const { data, error, loading, reload } = useApi(() => api.get<ShortItem[]>('/shorts/feed', { limit: 20 }));

  useEffect(() => {
    data?.forEach((sh) => track('SHORT_PLAY', { work_id: sh.work_id, short_id: sh.id }));
  }, [data]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload}>
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 ? <Empty text="숏츠가 아직 없어요" /> : null}
      {data?.map((sh) => (
        <Card key={sh.id} style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ height: 260, backgroundColor: colors.deepest, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play-circle" size={64} color={colors.glow} />
            <Muted style={{ marginTop: space(2) }}>1분 숏츠 · {sh.duration_sec}초 (영상은 시연용 자리)</Muted>
          </View>
          <View style={{ padding: space(4) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T weight="700" style={{ flex: 1 }}>{sh.work_title}</T>
              {sh.funding_status ? <Badge label={FUNDING_STATUS[sh.funding_status]} tone="accent" /> : null}
            </Row>
            <Muted>{sh.title}</Muted>
            <Row style={{ marginTop: space(3), gap: space(2) }}>
              <Button title="작품 보기" kind="ghost" style={{ flex: 1 }} onPress={() => router.push(`/work/${sh.work_id}`)} />
              {sh.funding_id && sh.funding_status === 'OPEN' ? (
                <Button
                  title="펀딩 바로가기"
                  style={{ flex: 1 }}
                  onPress={() => {
                    track('FUNDING_CTA', { work_id: sh.work_id, funding_id: sh.funding_id ?? undefined, referrer: 'shorts' });
                    router.push(`/funding/${sh.funding_id}`);
                  }}
                />
              ) : null}
            </Row>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
