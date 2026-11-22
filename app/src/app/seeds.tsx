import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Dibby } from '@/components/dibby';
import { ErrorBox, Loading } from '@/components/ui';
import { BigBtn, SubHeader, Txt, V2Screen, color, PINK } from '@/ds';
import { api, type ApiError, type Wallet } from '@/lib/api';
import { useApi } from '@/lib/useApi';

// 08 씨앗 구매 (Screens – MVP v2): 씨앗 묶음 10 · 30 · 55(+5), 키움 포인트 전환
// 결제: 키움 예치금에서 결제 금액만큼 빠진다 (DEPOSIT). 7일 안에 안 쓴 묶음은 결제 취소하면 예치금으로 돌아간다
type Pkg = { id: string; seeds: number; bonus_seeds: number; price: number; iap_price: number; total_seeds: number };
type Points = { balance: number };

function Seed({ size = 22 }: { size?: number }) {
  return <View style={{ width: size * 0.48, height: size * 0.82, borderRadius: size, backgroundColor: '#4A3426', transform: [{ rotate: '12deg' }] }} />;
}

export default function Seeds() {
  const { back } = useLocalSearchParams<{ back?: string }>();
  const [pick, setPick] = useState('seed30');
  const [busy, setBusy] = useState(false);
  // 결제 전 확인 시트: 'buy' 씨앗 구매, 'convert' 키움 포인트 전환. 결과·오류도 같은 화면 안에 띄운다 (웹은 Alert 가 안 뜸)
  const [ask, setAsk] = useState<'buy' | 'convert' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const { data, error, loading, reload } = useApi(async () => {
    const [pkgs, w, pts] = await Promise.all([
      api.get<Pkg[]>('/wallet/coin/packages'), api.get<Wallet & { seeds?: number }>('/wallet'),
      api.get<Points>('/me/partner-points').catch(() => ({ balance: 0 })),
    ]);
    return { pkgs, w, pts };
  }, []);

  const p = data?.pkgs.find((x) => x.id === pick);
  const seeds = data ? Math.floor(data.w.coin / 100) : 0;
  const ptSeeds = Math.floor((data?.pts.balance ?? 0) / 100);
  const dep = data?.w.deposit_available ?? 0;

  const buy = async () => {
    if (!p) return;
    setBusy(true);
    try {
      await api.post('/wallet/coin/packages/buy', { package_id: p.id, channel: 'DEPOSIT' });
      setAsk(null);
      if (back) router.back();
      else { await reload(); setNotice({ ok: true, text: `결제했어요 · 씨앗 ${p.total_seeds}개가 들어왔어요 (${p.price.toLocaleString('ko-KR')}원)` }); }
    } catch (e) {
      setAsk(null);
      setNotice({ ok: false, text: `결제하지 못했어요 · ${(e as ApiError).message}` });
    } finally {
      setBusy(false);
    }
  };
  const convert = async () => {
    if (!ptSeeds) return;
    setBusy(true);
    try {
      await api.post('/me/partner-points/convert', { points: ptSeeds * 100 });
      setAsk(null);
      await reload();
      setNotice({ ok: true, text: `키움 포인트 ${(ptSeeds * 100).toLocaleString('ko-KR')}P를 씨앗 ${ptSeeds}개로 바꿨어요` });
    } catch (e) {
      setAsk(null);
      setNotice({ ok: false, text: `바꾸지 못했어요 · ${(e as ApiError).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <V2Screen header={<SubHeader title="씨앗 구매" />} pad={20} gap={10}
      footer={p ? <BigBtn label={`씨앗 ${p.total_seeds}개 · ${p.price.toLocaleString('ko-KR')}원 결제하기`} disabled={busy} onPress={() => { setNotice(null); setAsk('buy'); }} h={52} /> : undefined}>
      <ErrorBox error={error} onRetry={reload} />
      {notice ? (
        <View accessibilityRole="alert" style={{ padding: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: notice.ok ? '#EEF8F1' : '#FDEEEE', marginTop: 8 }}>
          <Txt v="label2" w="semibold" c={notice.ok ? '#1F7A45' : color.negative}>{notice.text}</Txt>
        </View>
      ) : null}
      {loading && !data ? <Loading /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: '#FFF8EC', borderWidth: 1, borderColor: '#F3E3C6', marginTop: 8, marginBottom: 6 }}>
        <Dibby pose="dibs" size={56} />
        <View>
          <Txt v="caption1" w="semibold" c="#8A5A12">내 씨앗</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}><Seed /><Txt v="title3" w="bold" c="#2A1620">{seeds.toLocaleString('ko-KR')}개</Txt></View>
          <Txt v="caption1" w="medium" c={color.labelAlternative}>유료 회차 1화 = 씨앗 3개</Txt>
        </View>
      </View>
      {data && data.pts.balance > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 16, backgroundColor: '#FFF6F9', borderWidth: 1, borderColor: '#F6D6E2', marginBottom: 4 }}>
          <View style={{ flex: 1 }}>
            <Txt v="label1" w="bold" c={color.labelStrong}>키움 포인트로 바꾸기</Txt>
            <Txt v="caption1" w="medium" c="#9C3F66">100P = 씨앗 1개 · 보유 {data.pts.balance.toLocaleString('ko-KR')}P → 씨앗 {ptSeeds}개</Txt>
          </View>
          <Pressable onPress={() => { setNotice(null); setAsk('convert'); }} disabled={!ptSeeds} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.white, borderWidth: 1, borderColor: '#F3C7D6', justifyContent: 'center', opacity: ptSeeds ? 1 : 0.5 }}>
            <Txt v="label2" w="bold" c={PINK}>{ptSeeds}개 받기</Txt>
          </Pressable>
        </View>
      ) : null}
      <Txt v="label2" w="bold" c={color.labelStrong} style={{ marginTop: 6, marginHorizontal: 2 }}>씨앗 묶음</Txt>
      {(data?.pkgs ?? []).map((x) => {
        const on = x.id === pick;
        const eps = Math.floor(x.total_seeds / 3);
        return (
          <Pressable key={x.id} onPress={() => setPick(x.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 68, paddingHorizontal: 16, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? '#E58AA8' : color.lineNormal, backgroundColor: on ? '#FFF6F9' : color.white }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#FBF3E6', alignItems: 'center', justifyContent: 'center' }}><Seed /></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt v="body1" w="bold" c={color.labelStrong}>씨앗 {x.total_seeds}개</Txt>
                {x.id === 'seed30' ? <View style={{ height: 20, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#FDEBF1', justifyContent: 'center' }}><Txt v="caption2" w="bold" c={PINK}>많이 골라요</Txt></View> : null}
              </View>
              <Txt v="caption1" w="medium" c={color.labelAlternative}>{x.bonus_seeds ? `+${x.bonus_seeds}개 보너스 · ` : ''}{eps}화 볼 수 있어요</Txt>
            </View>
            <Txt v="label1" w="bold" c={color.labelStrong} tabular>{x.price.toLocaleString('ko-KR')}원</Txt>
          </Pressable>
        );
      })}
      <Txt v="caption1" w="medium" c={color.labelAssistive} style={{ marginTop: 6, marginHorizontal: 2 }}>
        씨앗 값은 키움 예치금에서 결제돼요. 씨앗은 회차 미리보기·굿즈·이벤트에만 쓰고 현금이나 예치금으로 바꿀 수 없어요. 7일 안에 쓰지 않은 씨앗은 결제를 취소할 수 있어요. 보너스 씨앗은 90일 뒤 사라져요.
      </Txt>
      {p ? (
        <ConfirmSheet visible={ask === 'buy'} onClose={() => setAsk(null)} busy={busy} title="결제할까요?"
          rows={[
            { label: '상품', value: `씨앗 ${p.total_seeds}개${p.bonus_seeds ? ` (보너스 ${p.bonus_seeds}개 포함)` : ''}` },
            { label: '결제 수단', value: '키움 예치금' },
            { label: '결제 후 예치금', value: `${dep.toLocaleString('ko-KR')}원 → ${(dep - p.price).toLocaleString('ko-KR')}원` },
            { label: '결제 후 내 씨앗', value: `${seeds.toLocaleString('ko-KR')}개 → ${(seeds + p.total_seeds).toLocaleString('ko-KR')}개` },
            { label: '결제 금액', value: `${p.price.toLocaleString('ko-KR')}원`, strong: true },
          ]}
          note={dep < p.price ? `예치금이 ${(p.price - dep).toLocaleString('ko-KR')}원 모자라요. 예치금을 충전하고 다시 시도해 주세요.` : '7일 안에 쓰지 않은 씨앗은 결제를 취소할 수 있고, 취소하면 예치금으로 돌아가요. 씨앗을 예치금으로 바꾸는 건 안 돼요.'}
          confirmLabel={`${p.price.toLocaleString('ko-KR')}원 결제하기`} onConfirm={buy} disabled={dep < p.price} />
      ) : null}
      <ConfirmSheet visible={ask === 'convert'} onClose={() => setAsk(null)} busy={busy} title="포인트를 씨앗으로 바꿀까요?"
        rows={[
          { label: '쓸 키움 포인트', value: `${(ptSeeds * 100).toLocaleString('ko-KR')}P` },
          { label: '남는 포인트', value: `${((data?.pts.balance ?? 0) - ptSeeds * 100).toLocaleString('ko-KR')}P` },
          { label: '받을 씨앗', value: `${ptSeeds}개`, strong: true },
        ]}
        note="100P = 씨앗 1개. 바꾼 씨앗은 포인트로 되돌릴 수 없어요."
        confirmLabel={`씨앗 ${ptSeeds}개로 바꾸기`} onConfirm={convert} />
    </V2Screen>
  );
}
