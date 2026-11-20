import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CtaBar } from '@/components/dibby';
import { Button, Check, ErrorBox, KV, Loading, Screen, Stepper, T } from '@/components/ui';
import { api, ApiError, type FundingDetail, type MockKiwoomResult } from '@/lib/api';
import { nowMs } from '@/lib/now';
import { useKiwoomLink } from '@/lib/prefs';
import { showDone } from '@/lib/done';
import { dateText, won } from '@/lib/format';
import { colors, radii, space } from '@/lib/theme';

/**
 * 모의 키움 청약 화면 (B안 시연).
 * 실제로는 DIBS 앱의 '키움에서 청약하기'가 키움 앱 딥링크를 열고, 청약·계좌·투자성향 확인은 키움 화면에서 일어난다.
 * 제휴 API가 없으므로 DIBS가 제안한 연동 규격대로 움직이는 모의 키움 서버(/dev/mock-kiwoom)를 호출한다.
 */
export default function MockKiwoomScreen() {
  const { id, token, units: u0 } = useLocalSearchParams<{ id: string; token: string; units?: string }>();
  const [f, setF] = useState<FundingDetail | null>(null);
  const [units, setUnits] = useState(Math.max(1, Number(u0) || 1));
  const [splash, setSplash] = useState(true);
  const [link, setLink] = useKiwoomLink();
  const [newAccount, setNewAccount] = useState(true);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    api.get<FundingDetail>(`/fundings/${id}`).then(setF).catch((e) => setError(e as ApiError));
  }, [id]);

  if (splash) return <><Stack.Screen options={{ headerShown: false }} /><KiwoomSplash onDone={() => setSplash(false)} /></>;
  if (!f) return <Screen><Stack.Screen options={{ headerShown: true }} />{error ? <ErrorBox error={error} /> : <Loading />}</Screen>;
  const max = f.per_user_cap_units;

  const submit = async () => {
    if (!agree) {
      setError(new ApiError(0, 'CONSENT_REQUIRED', '투자 위험과 시즌 종료 규칙을 먼저 확인해 주세요'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<MockKiwoomResult>('/dev/mock-kiwoom/subscribe', { token, units, new_account: newAccount });
      const coupon = r.link?.coupon_coin ?? 0;
      if (!link.linked) setLink({ linked: true, account: '5012-****-31', at: new Date(nowMs()).toISOString().slice(0, 10) }); // MY > 연결 계좌에 반영
      showDone({
        pose: 'dibs',
        tag: 'KIWOOM',
        title: '키움에서 청약을 접수했어요',
        sub: `${f.work_title}\n${units}조각 청약`,
        rows: [
          ['청약 수량', `${units.toLocaleString('ko-KR')}조각`],
          ['청약 금액', won(units * f.unit_price)],
          ['배정 발표', f.close_at ? `${dateText(f.close_at)} 마감 후` : '마감 후'],
          ...(coupon ? ([['계좌 개설 쿠폰', `${coupon.toLocaleString('ko-KR')}코인`]] as [string, string][]) : []),
        ],
        note: '청약 대금과 분배금은 키움 계좌로 오가요. DIBS는 계좌번호를 받지 않고, 키움이 준 가명 연결 식별자만 저장해요.',
        aLabel: 'DIBS로 돌아가기',
        aHref: '/',
        bLabel: '펀딩 보기',
        bHref: `/funding/${id}`,
      });
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: true }} />
      <Screen>
        <View style={s.brand}>
          <T size={11} weight="700" color="#9FB0FF">키움증권 · 토큰증권 공모 청약</T>
          <T size={17} weight="700" color="#ffffff" style={{ marginTop: 4 }}>결제 전에 수량을 확인해 주세요</T>
          <T size={11} color="#ffffffb3" style={{ marginTop: 4 }}>DIBS에서 고른 수량 그대로 키움증권에서 청약해요.</T>
        </View>
        <View style={s.card}>
          <T size={15} weight="700">{f.work_title}</T>
          <KV k="1조각" v={won(f.unit_price)} />
          <KV k="1인 한도" v={`${max.toLocaleString('ko-KR')}조각`} />
          <KV k="마감" v={dateText(f.close_at)} />
        </View>
        <View style={[s.card, { alignItems: 'center' }]}>
          <Stepper value={units} onChange={setUnits} max={max} />
          <T size={13} color={colors.labelAlternative} style={{ marginTop: space(2) }}>청약 금액 {won(units * f.unit_price)}</T>
        </View>
        <View style={s.card}>
          <Check checked={newAccount} onToggle={() => setNewAccount(!newAccount)} label="키움 계좌를 이번에 처음 열었어요 (계좌 개설 쿠폰 대상)" />
          <Check checked={agree} onToggle={() => setAgree(!agree)} label="원금 손실 가능, 시즌 완결 후 12개월이 지나면 권리가 작가에게 돌아간다는 점을 확인했어요 (키움 투자 위험 고지)" />
          <T size={12} color={colors.labelAssistive} style={{ marginTop: space(2) }}>투자성향 확인·한도 확인·청약 대금은 키움이 처리해요. DIBS에는 청약 건수·금액 합계만 전달돼요.</T>
        </View>
        <ErrorBox error={error} />
      </Screen>
      <CtaBar>
        <Button title={`${won(units * f.unit_price)} 결제하고 청약하기`} onPress={submit} loading={busy} style={{ flex: 1, opacity: agree ? 1 : 0.55 }} />
      </CtaBar>
    </View>
  );
}

const s = StyleSheet.create({
  brand: { backgroundColor: '#14104A', borderRadius: radii.card, padding: space(4), marginBottom: space(3) },
  card: { borderRadius: radii.card, backgroundColor: colors.card, padding: space(4), marginTop: space(3) },
});

/** 키움 앱으로 넘어가는 느낌의 시작 화면 (모의 제휴 시연). 약 2초 동안 진행 막대가 차오른 뒤 결제 화면으로 */
function KiwoomSplash({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const p = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // 한 번만 돌린다 (부모가 다시 그려져도 처음부터 다시 시작하거나 일찍 끝나지 않게)
    const id = p.addListener(({ value }) => setPct(Math.round(value * 100)));
    let t: ReturnType<typeof setTimeout> | undefined;
    Animated.timing(p, { toValue: 1, duration: 2200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (finished) t = setTimeout(() => done.current(), 250);
    });
    return () => { p.removeListener(id); if (t) clearTimeout(t); };
  }, [p]);
  return (
    <View style={[k.wrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>
      <Text style={k.top}>DIBS × 키움증권</Text>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 120 }}>
        <Text style={k.tag}>잘 키우고 싶은 투자 본능</Text>
        <Text style={k.head}><Text style={{ color: '#8EA2FF' }}>조각투자</Text>도 키움</Text>
      </View>
      {/* 상자에서 튀어나오는 조각들 (그림 대신 도형) */}
      <View style={k.stage}>
        <View style={k.glow} />
        <View style={[k.chip, { backgroundColor: '#2F6BFF', left: 70, top: 10, transform: [{ rotate: '-8deg' }] }]}><Text style={k.chipT}>STO</Text></View>
        <View style={[k.chip, { backgroundColor: '#E2508C', left: 150, top: 46, transform: [{ rotate: '10deg' }] }]}><Text style={k.chipT}>조각</Text></View>
        <View style={[k.chip, { backgroundColor: '#7B5CF0', left: 84, top: 92, borderRadius: 40 }]}><Text style={k.chipT}>웹툰</Text></View>
        <View style={k.box}><Text style={k.boxT}>키움증권</Text></View>
      </View>
      <View style={{ flex: 1 }} />
      <Text style={k.brand}>키움증권</Text>
      <Text style={k.sub}>DIBS에서 결제 화면으로 이동하고 있어요</Text>
      <View style={k.barRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={k.ver}>Ver.1.6.2</Text>
          <View style={k.track}>
            <Animated.View style={[k.fill, { width: p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>
        <Text style={k.pct}>{pct}%</Text>
      </View>
    </View>
  );
}

const k = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0D0A26', paddingHorizontal: 28, alignItems: 'stretch' },
  top: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'Pretendard-Medium', textAlign: 'center' },
  tag: { color: 'rgba(255,255,255,0.86)', fontSize: 18, fontFamily: 'Pretendard-Medium' },
  head: { color: '#FFFFFF', fontSize: 38, fontFamily: 'Pretendard-Bold', letterSpacing: -1 },
  stage: { alignSelf: 'center', width: 260, height: 220, marginTop: 48 },
  glow: { position: 'absolute', left: 10, top: 0, width: 240, height: 220, borderRadius: 120, backgroundColor: 'rgba(47,107,255,0.22)' },
  chip: { position: 'absolute', width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  chipT: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Pretendard-Bold' },
  box: { position: 'absolute', left: 30, right: 30, bottom: 0, height: 64, borderRadius: 14, backgroundColor: '#D9DCE6', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 16 },
  boxT: { color: '#8D93A6', fontSize: 15, fontFamily: 'Pretendard-Bold' },
  brand: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Pretendard-Bold', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'Pretendard-Regular', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  ver: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Pretendard-Medium' },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#2F49FF' },
  pct: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Pretendard-Medium', width: 44, textAlign: 'right' },
});
