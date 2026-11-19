import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';

import { Badge, Button, Card, ErrorBox, H1, H2, Loading, Muted, Row, Screen, T } from '@/components/ui';
import { api, ApiError, track, type Episode, type WorkDetail } from '@/lib/api';
import { FUNDING_STATUS } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function WorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload, setData } = useApi(async () => {
    const [work, episodes] = await Promise.all([api.get<WorkDetail>(`/works/${id}`), api.get<Episode[]>(`/works/${id}/episodes`)]);
    return { work, episodes };
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
  const { work, episodes } = data;
  const fs = work.funding_status;

  const cta = () => {
    if (!work.funding_id || !fs) return null;
    if (fs === 'OPEN') return <Button title="펀딩 참여하기" onPress={() => router.push(`/funding/${work.funding_id}`)} />;
    if (['LISTED', 'SUSPENDED', 'MATURED'].includes(fs)) return <Button title="조각 마켓에서 보기" onPress={() => router.push(`/security/${work.funding_id}`)} />;
    return <Button title={`펀딩 결과 보기 (${FUNDING_STATUS[fs]})`} kind="ghost" onPress={() => router.push(`/funding/${work.funding_id}`)} />;
  };

  return (
    <Screen onRefresh={reload}>
      <Card style={{ backgroundColor: colors.cardAlt, paddingVertical: space(6) }}>
        <Row>
          <Badge label={work.genre} />
          {fs ? <Badge label={FUNDING_STATUS[fs]} tone="accent" /> : null}
        </Row>
        <H1>{work.title}</H1>
        <Muted size={14}>{work.synopsis || '줄거리가 아직 없어요'}</Muted>
        <Row style={{ marginTop: space(4), justifyContent: 'space-between' }}>
          <T color={colors.muted}>♥ {work.dib_count.toLocaleString('ko-KR')}명이 찜했어요</T>
          <Button title={work.is_dibbed ? '♥ 찜함' : '♡ 찜하기'} kind={work.is_dibbed ? 'primary' : 'ghost'} onPress={toggleDib} style={{ height: 40 }} />
        </Row>
      </Card>
      {cta()}

      <H2>회차 {episodes.length}</H2>
      {episodes.map((ep) => (
        <Card key={ep.id} onPress={() => router.push(`/episode/${ep.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T>{ep.no}화 · {ep.title}</T>
            {ep.is_paid && !ep.unlocked ? <Badge label={`🔒 ${ep.price_coin}코인`} tone="accent" /> : <Muted>{ep.is_paid ? '구매함' : '무료'}</Muted>}
          </Row>
        </Card>
      ))}
      <View style={{ height: space(4) }} />
      <Muted>발행 전에는 모든 회차가 무료예요. 상장 후 운영자가 회차별 유료 여부를 정해요.</Muted>
    </Screen>
  );
}
