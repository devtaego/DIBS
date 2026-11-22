import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Fold } from '@/components/Fold';
import { SocialButtons } from '@/components/SocialButtons';
import { BigBtn, Field, SubHeader, Txt, V2Screen, color, formatPhone, textStyle, validPhone } from '@/ds';
import { api, ApiError, guessBaseUrl, type Me } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { useSession } from '@/lib/session';
import { finishLogin, type SocialResult } from '@/lib/social';

// 00 로그인 (Screens – MVP v2): 휴대폰 번호 → 인증번호, 간편 로그인(카카오·네이버·구글)
// 서버에 붙였을 때: 역할별 계정 4개가 각각 실제로 로그인된다
const SERVER_ACCOUNTS: { email: string; role: Me['role']; label: string; desc: string; off?: boolean }[] = [
  { email: 'reader30@dibs.dev', role: 'READER', label: '새 투자자', desc: '아직 청약하지 않은 계정' },
  { email: 'reader1@dibs.dev', role: 'READER', label: '기존 투자자', desc: '청약·보유 조각 있음' },
  { email: 'creator@dibs.dev', role: 'CREATOR', label: '창작자', desc: '작품 2개 · 정산 확인' },
  { email: 'admin@dibs.dev', role: 'ADMIN', label: '운영자', desc: '마감·상장·배당 실행' },
];
// 정적 시연: 녹화한 데이터가 투자자 한 명 기준이라 체험 투자자만 열고, 나머지 역할은 흐리게 보여 준다
const DEMO_ACCOUNTS: typeof SERVER_ACCOUNTS = [
  { email: 'reader1@dibs.dev', role: 'READER', label: '체험 투자자', desc: '청약·보유 조각이 있는 시연 계정' },
  { email: 'creator@dibs.dev', role: 'CREATOR', label: '창작자', desc: '서버에 연결하면 쓸 수 있어요', off: true },
  { email: 'admin@dibs.dev', role: 'ADMIN', label: '운영자', desc: '서버에 연결하면 쓸 수 있어요', off: true },
];
const ACCOUNTS = DEMO ? DEMO_ACCOUNTS : SERVER_ACCOUNTS;

export default function Login() {
  const { out } = useLocalSearchParams<{ out?: string }>(); // MY > 로그아웃으로 들어왔는지
  const { login, loginWithToken, baseUrl, changeBaseUrl } = useSession();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState(baseUrl || guessBaseUrl());
  const [health, setHealth] = useState<string | null>(null);

  useEffect(() => { if (baseUrl) setUrl(baseUrl); }, [baseUrl]);

  const requestOtp = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!DEMO) await changeBaseUrl(url);
      const r = await api.post<{ expires_in: number; dev_code: string | null }>('/auth/phone/request', { phone });
      router.push({ pathname: '/otp', params: { phone, dev: r.dev_code ?? '', ttl: String(r.expires_in) } });
    } catch (e) {
      setMsg((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const onSocial = async (r: SocialResult) => {
    if (!r) return; // 웹: 동의 화면으로 넘어감 → /auth 에서 마무리
    if ('error' in r) { if (r.error !== 'cancelled') setMsg('간편 로그인을 마치지 못했어요. 다시 시도해 주세요'); return; }
    const me = await loginWithToken(r.token);
    if (me) finishLogin(r.isNew); else setMsg('로그인 정보를 확인하지 못했어요');
  };

  const demoLogin = async (email: string, role: Me['role']) => {
    try {
      if (!DEMO) await changeBaseUrl(url);
      await login(email, role);
      router.replace('/');
    } catch (e) {
      setMsg((e as ApiError).message);
    }
  };

  const check = async () => {
    await changeBaseUrl(url);
    try {
      const h = await api.get<{ mode: string }>('/health');
      setHealth(`연결됨 · ${h.mode === 'MOCK' ? '모의투자 모드' : '실거래 모드'}`);
    } catch (e) {
      setHealth((e as ApiError).message);
    }
  };

  const valid = validPhone(phone);
  return (
    <V2Screen header={<SubHeader />} pad={24} footer={<BigBtn label={busy ? '보내는 중…' : '인증번호 받기'} disabled={!valid || busy} onPress={requestOtp} h={52} />}>
      <View style={{ gap: 8, marginTop: 4, marginBottom: 24 }}>
        {/* 첫 방문·로그아웃 뒤·'이미 계정이 있나요'에서 모두 오는 화면이라 인사 대신 할 일을 말한다 */}
        <Txt v="title3" w="bold" c={color.labelStrong}>{out === '1' ? '로그아웃했어요' : '휴대폰 번호로\n시작해요'}</Txt>
        <Txt v="label2" c={color.labelNeutral}>{out === '1' ? '다시 들어오려면 가입할 때 쓴 휴대폰 번호로 로그인해요.' : '가입한 번호면 로그인되고, 처음이면 바로 가입돼요.'}</Txt>
      </View>
      <Field label="휴대폰 번호" value={phone} onChangeText={(t) => setPhone(formatPhone(t))} placeholder="010-0000-0000" keyboardType="number-pad" maxLength={13}
        status={phone.length >= 12 && !valid ? 'Negative' : undefined} help={phone.length >= 12 && !valid ? '휴대폰 번호를 다시 확인해 주세요' : undefined} />
      <View style={{ gap: 8, marginTop: 24 }}>
        <Txt v="caption1" w="medium" c={color.labelAlternative}>간편 로그인</Txt>
        <SocialButtons onResult={onSocial} />
      </View>
      {msg ? <Txt v="label2" w="medium" c={color.negative} style={{ marginTop: 12 }}>{msg}</Txt> : null}

      <View style={{ marginTop: 28 }}>
        <Fold title="개발·시연" sub={DEMO ? '체험 계정으로 바로 시작' : '서버 주소, 시연 계정으로 바로 시작'} icon="gear" last>
          {!DEMO ? (
            <View style={{ gap: 8 }}>
              <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} accessibilityLabel="서버 주소"
                style={[textStyle('label1', 'medium'), { height: 44, borderRadius: 10, backgroundColor: color.bgAlternative, paddingHorizontal: 12, color: color.labelStrong }]} />
              <Pressable onPress={check} accessibilityRole="button"><Txt v="label2" w="semibold" c={color.primaryStrong}>연결 확인{health ? ` · ${health}` : ''}</Txt></Pressable>
            </View>
          ) : null}
          {ACCOUNTS.map((d) => (
            <Pressable key={d.email} onPress={d.off ? undefined : () => demoLogin(d.email, d.role)} disabled={d.off}
              accessibilityRole="button" accessibilityState={{ disabled: !!d.off }}
              style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: color.lineAlternative, opacity: d.off ? 0.45 : 1 }}>
              <View style={{ flex: 1 }}>
                <Txt v="label1" w="semibold" c={color.labelStrong}>{d.label}</Txt>
                <Txt v="caption1" c={color.labelAlternative}>{d.desc}</Txt>
              </View>
              {d.off ? null : <Txt v="label1" c={color.labelAssistive}>→</Txt>}
            </Pressable>
          ))}
        </Fold>
      </View>
    </V2Screen>
  );
}
