import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShortVideo } from '@/components/ShortVideo';
import { imageSource } from '@/lib/media';

import { Button, Card, Loading, Muted, Screen, T } from '@/components/ui';
import { api, ApiError, track, type Episode, type WorkDetail } from '@/lib/api';
import { phaseOf } from '@/lib/phase';
import { usePref } from '@/lib/prefs';
import { useApi } from '@/lib/useApi';
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
      if (err.code === 'INSUFFICIENT_BALANCE') router.push({ pathname: '/seeds', params: { back: '1' } });
      else Alert.alert('구매 실패', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    const price = Number(locked.message.match(/(\d[\d,]*)코인/)?.[1]?.replace(/,/g, '') ?? 300);
    const need = Math.ceil(price / 100) * 100; // 키움 포인트는 100P 단위
    const seedPrice = Math.round(price / 100);
    const mySeeds = coin == null ? null : Math.floor(coin / 100);
    const short = mySeeds != null && mySeeds < seedPrice;
    return (
      <Screen>
        {/* 08 작품 · 회차 열기 (씨앗 3개) */}
        <Card style={{ alignItems: 'center', paddingVertical: space(10) }}>
          <T size={40}>🔒</T>
          <T weight="700" style={{ marginTop: space(3) }}>미리보기 회차예요 · 씨앗 {seedPrice}개</T>
          <Muted style={{ marginTop: space(2), textAlign: 'center' }}>{`내 씨앗 ${mySeeds?.toLocaleString('ko-KR') ?? '-'}개 · 키움 포인트 ${pts?.balance.toLocaleString('ko-KR') ?? '-'}P`}</Muted>
          {short ? (
            <Button title={`씨앗 ${seedPrice - (mySeeds ?? 0)}개가 모자라요 · 씨앗 사기`} onPress={() => router.push({ pathname: '/seeds', params: { back: '1' } })} style={{ marginTop: space(6), alignSelf: 'stretch' }} />
          ) : (
            <Button title={`씨앗 ${seedPrice}개로 열기`} onPress={unlock} loading={busy} style={{ marginTop: space(6), alignSelf: 'stretch' }} />
          )}
          {pts && pts.balance >= need ? (
            <Button title={`키움 포인트 ${need.toLocaleString('ko-KR')}P로 열기`} kind="ghost" onPress={unlockWithPoints} loading={busy} style={{ marginTop: space(2), alignSelf: 'stretch' }} />
          ) : null}
          <Muted style={{ marginTop: space(3), textAlign: 'center' }}>정식 공개되면 무료로 볼 수 있어요. 씨앗은 콘텐츠 전용이라 예치금으로 바꿀 수 없어요.{'\n'}키움 포인트 100P = 씨앗 1개.</Muted>
        </Card>
      </Screen>
    );
  }
  if (!ep) return <Screen><Loading /></Screen>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
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
              <Muted>{n === 1 ? '이 회차 원고는 곧 올라와요' : `웹툰 컷 ${n}`}</Muted>
            </View>
          ))}
        </>
      )}
    </Screen>
    <ReaderBar ep={ep} />
    </View>
  );
}

/** 회차 하단 바: 이전화 · 좋아요 · 조각 사기 · 다음화 */
function ReaderBar({ ep }: { ep: EpisodeContent }) {
  const insets = useSafeAreaInsets();
  const { data } = useApi(async () => {
    const [eps, work] = await Promise.all([api.get<Episode[]>(`/works/${ep.work_id}/episodes`), api.get<WorkDetail>(`/works/${ep.work_id}`)]);
    return { eps, work };
  }, [ep.work_id]);
  const [likes, setLikes] = usePref<number[]>('likedEpisodes', []);
  const liked = likes.includes(ep.id);
  const eps = data?.eps ?? [];
  const i = eps.findIndex((e) => e.id === ep.id);
  const prev = i > 0 ? eps[i - 1] : null;
  const next = i >= 0 && i < eps.length - 1 ? eps[i + 1] : null;
  const w = data?.work;
  const ph = phaseOf(w?.funding_status);
  const buy = () => {
    if (!w) return;
    if (ph === 'OPEN' && w.funding_id) return router.push(`/subscribe/${w.funding_id}`);
    if (w.funding_status === 'LISTED' && w.funding_id) return router.push(`/security/${w.funding_id}`);
    router.push(`/work/${w.id}`);
  };
  const buyLabel = ph === 'OPEN' ? '조각 사기' : w?.funding_status === 'LISTED' ? '조각 거래' : '공모 예정';
  const go = (e: Episode | null, done: boolean) => {
    if (!e) return;
    if (done) track('VIEW_COMPLETE', { work_id: ep.work_id, episode_id: ep.id, progress: 1 }); // 다음 화로 넘어가면 완독
    router.replace(`/episode/${e.id}`);
  };
  const Item = ({ icon, label, onPress, on, disabled }: { icon: string; label: string; onPress: () => void; on?: boolean; disabled?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, opacity: disabled ? 0.35 : 1 }}>
      <Ionicons name={icon as never} size={22} color={on ? '#DE5786' : '#2B2D36'} />
      <T size={11} weight="600" color={on ? '#DE5786' : '#4E5260'}>{label}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ECEDF1', backgroundColor: '#FFFFFF', paddingBottom: Math.max(insets.bottom, 6), paddingHorizontal: 8 }}>
      <Item icon="chevron-back" label="이전화" onPress={() => go(prev, false)} disabled={!prev} />
      <Item icon={liked ? 'heart' : 'heart-outline'} label={liked ? '좋아요 취소' : '좋아요'} on={liked} onPress={() => setLikes(liked ? likes.filter((x) => x !== ep.id) : [...likes, ep.id])} />
      <Pressable onPress={buy} accessibilityRole="button" accessibilityLabel={buyLabel}
        style={{ flex: 1.4, marginVertical: 6, borderRadius: 999, backgroundColor: ph === 'OPEN' ? '#DE5786' : '#F2F3F6', alignItems: 'center', justifyContent: 'center' }}>
        <T size={13} weight="700" color={ph === 'OPEN' ? '#FFFFFF' : '#2B2D36'}>{buyLabel}</T>
      </Pressable>
      <Item icon="chevron-forward" label="다음화" onPress={() => go(next, true)} disabled={!next} />
    </View>
  );
}
