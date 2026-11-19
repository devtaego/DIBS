import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Loading, Muted, Screen, T } from '@/components/ui';
import { api, ApiError, track } from '@/lib/api';
import { colors, space } from '@/lib/theme';

type EpisodeContent = { id: number; work_id: number; no: number; title: string; content_url: string; is_paid: boolean; price_coin: number };

export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ep, setEp] = useState<EpisodeContent | null>(null);
  const [locked, setLocked] = useState<{ message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const e = await api.get<EpisodeContent>(`/episodes/${id}`);
      setEp(e);
      setLocked(null);
      track('VIEW_START', { work_id: e.work_id, episode_id: e.id });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'PAYMENT_REQUIRED') setLocked({ message: err.message });
      else Alert.alert('열 수 없어요', err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const unlock = async () => {
    setBusy(true);
    try {
      await api.post(`/episodes/${id}/unlock`);
      await load();
    } catch (e) {
      const err = e as ApiError;
      Alert.alert(err.code === 'INSUFFICIENT_BALANCE' ? '코인이 부족해요' : '구매 실패', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center', paddingVertical: space(10) }}>
          <T size={40}>🔒</T>
          <T weight="700" style={{ marginTop: space(3) }}>{locked.message}</T>
          <Muted style={{ marginTop: space(2), textAlign: 'center' }}>코인은 콘텐츠 전용이에요. 투자 예치금으로 바꿀 수 없어요.</Muted>
          <Button title="코인으로 열기" onPress={unlock} loading={busy} style={{ marginTop: space(6), alignSelf: 'stretch' }} />
        </Card>
      </Screen>
    );
  }
  if (!ep) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <T size={20} weight="800">{ep.no}화 · {ep.title}</T>
      <Muted>{ep.is_paid ? `유료 회차 (${ep.price_coin}코인)` : '무료 회차'}</Muted>
      {[1, 2, 3].map((n) => (
        <View key={n} style={{ height: 360, backgroundColor: n % 2 ? colors.card : colors.cardAlt, borderRadius: 12, marginTop: space(3), alignItems: 'center', justifyContent: 'center' }}>
          <Muted>웹툰 컷 {n} (시연용 자리)</Muted>
        </View>
      ))}
      <Muted style={{ marginTop: space(2) }}>원본 위치: {ep.content_url}</Muted>
      <Button
        title="다 읽었어요"
        style={{ marginTop: space(6) }}
        onPress={() => {
          track('VIEW_COMPLETE', { work_id: ep.work_id, episode_id: ep.id, progress: 1 });
          Alert.alert('완독 기록', '연독률 집계에 반영돼요');
        }}
      />
    </Screen>
  );
}
