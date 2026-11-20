import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CtaBar } from '@/components/dibby';
import { KiwoomSplash } from '@/components/KiwoomSplash';
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
  const [agree, setAgree] = useState(!!u0); // DIBS에서 위험 고지를 확인하고 넘어왔으면 미리 체크 (다시 보고 해제할 수 있음)
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
      const r = await api.post<MockKiwoomResult>('/dev/mock-kiwoom/subscribe', { token, units, new_account: newAccount && !link.linked });
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
        bLabel: '내 펀딩 보기',
        bHref: '/portfolio?tab=subs',
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
          {u0 ? (
            // DIBS에서 정한 수량 그대로: 키움 화면에서는 바꾸지 않는다 (바꾸려면 DIBS로 돌아가서)
            <>
              <T size={13} color={colors.labelAlternative}>청약 수량</T>
              <T size={26} weight="700" style={{ marginTop: space(1) }}>{units.toLocaleString('ko-KR')}조각</T>
              <T size={13} color={colors.labelAlternative} style={{ marginTop: space(1) }}>청약 금액 {won(units * f.unit_price)} · DIBS에서 정한 수량이에요</T>
            </>
          ) : (
            <>
              <Stepper value={units} onChange={setUnits} max={max} />
              <T size={13} color={colors.labelAlternative} style={{ marginTop: space(2) }}>청약 금액 {won(units * f.unit_price)}</T>
            </>
          )}
        </View>
        <View style={s.card}>
          {link.linked ? null : <Check checked={newAccount} onToggle={() => setNewAccount(!newAccount)} label="키움 계좌를 이번에 처음 열었어요 (계좌 개설 쿠폰 대상)" />}
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

