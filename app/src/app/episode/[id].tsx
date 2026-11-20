import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { ShortVideo } from '@/components/ShortVideo';
import { imageSource } from '@/lib/media';

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

  const [coin, setCoin] = useState<number | null>(null);
  const [pts, setPts] = useState<{ balance: number } | null>(null);
  useEffect(() => {
    if (!locked) return;
    api.get<{ coin: number }>('/wallet').then((w) => setCoin(w.coin)).catch(() => {});
    api.get<{ balance: number }>('/me/partner-points').then(setPts).catch(() => {});
  }, [locked]);
  const unlockWithPoints = async () => {
    const price = Number(locked?.message.match(/(\d[\d,]*)코인/)?.[1]?.replace(/,/g, '') ?? 300);
    setBusy(true);
    try {
      await api.post('/me/partner-points/convert', { points: Math.ceil(price / 100) * 100 });
      await api.post(`/episodes/${id}/unlock`);
      await load();
    } catch (e) {
      Alert.alert('열 수 없어요', (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

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
    const price = Number(locked.message.match(/(\d[\d,]*)코인/)?.[1]?.replace(/,/g, '') ?? 300);
    const need = Math.ceil(price / 100) * 100; // 키움 포인트는 100P 단위
    return (
      <Screen>
        <Card style={{ alignItems: 'center', paddingVertical: space(10) }}>
          <T size={40}>🔒</T>
          <T weight="700" style={{ marginTop: space(3) }}>{locked.message}</T>
          <Muted style={{ marginTop: space(2), textAlign: 'center' }}>{`내 코인 ${coin?.toLocaleString('ko-KR') ?? '-'} · 키움 포인트 ${pts?.balance.toLocaleString('ko-KR') ?? '-'}P`}</Muted>
          <Button title="코인으로 열기" onPress={unlock} loading={busy} style={{ marginTop: space(6), alignSelf: 'stretch' }} />
          {pts && pts.balance >= need ? (
            <Button title={`키움 포인트 ${need.toLocaleString('ko-KR')}P로 열기`} kind="ghost" onPress={unlockWithPoints} loading={busy} style={{ marginTop: space(2), alignSelf: 'stretch' }} />
          ) : null}
          <Muted style={{ marginTop: space(3), textAlign: 'center' }}>코인은 콘텐츠 전용이에요. 투자 예치금으로 바꿀 수 없어요.{'\n'}키움 포인트는 1P = 1코인으로 바뀌어요.</Muted>
        </Card>
      </Screen>
    );
  }
  if (!ep) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <T size={20} weight="700">{ep.title === `${ep.no}화` ? ep.title : `${ep.no}화 · ${ep.title}`}</T>
      <Muted>{ep.is_paid ? `유료 미리보기 (${ep.price_coin}원 · 공개 21일 뒤 무료)` : '무료 회차'}</Muted>
      {/@\d+\.jpg$/.test(ep.content_url) ? (
        // 세로 스크롤 웹툰: 'episodes/pmb-1@22.jpg' → pmb-1-01.jpg … pmb-1-22.jpg (각 720x1800) 를 이어 붙여 보여 준다
        <View style={{ marginTop: space(3), marginHorizontal: -space(5), backgroundColor: '#0E0F1F' }}>
          {Array.from({ length: Number(ep.content_url.match(/@(\d+)\.jpg$/)![1]) }, (_, i) => {
            const src = ep.content_url.replace(/@\d+\.jpg$/, `-${String(i + 1).padStart(2, '0')}.jpg`);
            return <Image key={src} source={imageSource(src)} accessibilityLabel={i === 0 ? `${ep.no}화 원고` : undefined} resizeMode="cover" style={{ width: '100%', aspectRatio: 720 / 1800 }} />;
          })}
        </View>
      ) : /\.mp4$/i.test(ep.content_url) ? (
        // 모션웹툰 회차 (앱과 같이 배포된 영상)
        <View style={{ width: '100%', aspectRatio: 9 / 16, marginTop: space(3) }}>
          <ShortVideo url={ep.content_url} durationSec={160} muted={false} scrubBottom={8} />
        </View>
      ) : /\.(jpe?g|png|webp)$/i.test(ep.content_url) ? (
        // 앱과 같이 배포된 원고 이미지 (세로 1:3)
        <Image source={imageSource(ep.content_url)} accessibilityLabel={`${ep.no}화 원고`} resizeMode="contain"
          style={{ width: '100%', aspectRatio: 724 / 2172, marginTop: space(3), borderRadius: 12, backgroundColor: colors.card }} />
      ) : (
        <>
          {[1, 2, 3].map((n) => (
            <View key={n} style={{ height: 360, backgroundColor: n % 2 ? colors.card : colors.cardAlt, borderRadius: 12, marginTop: space(3), alignItems: 'center', justifyContent: 'center' }}>
              <Muted>{n === 1 ? '원고를 불러오고 있어요' : `웹툰 컷 ${n}`}</Muted>
            </View>
          ))}
        </>
      )}
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
