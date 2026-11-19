import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, ErrorBox, H2, Muted, Screen, T, s } from '@/components/ui';
import { api, ApiError, guessBaseUrl, type Me } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

const DEMO: { email: string; role: Me['role']; label: string; desc: string }[] = [
  { email: 'reader30@dibs.dev', role: 'READER', label: '새 투자자 (reader30)', desc: '아직 청약하지 않은 계정 · 시연 시작용' },
  { email: 'reader1@dibs.dev', role: 'READER', label: '기존 투자자 (reader1)', desc: '청약·보유 조각·주주 게시판 글 있음' },
  { email: 'creator@dibs.dev', role: 'CREATOR', label: '창작자', desc: '작품 2개 · 정산 확인' },
  { email: 'admin@dibs.dev', role: 'ADMIN', label: '운영자', desc: '마감·상장·배당을 폰에서 실행' },
];

export default function Login() {
  const { login, baseUrl, changeBaseUrl } = useSession();
  const [url, setUrl] = useState(baseUrl || guessBaseUrl());
  const [health, setHealth] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (baseUrl) setUrl(baseUrl);
  }, [baseUrl]);

  const check = async () => {
    await changeBaseUrl(url);
    try {
      const h = await api.get<{ status: string; mode: string }>('/health');
      setHealth(`연결됨 · ${h.mode === 'MOCK' ? '모의투자 모드' : '실거래 모드'}`);
      setError(null);
    } catch (e) {
      setHealth(null);
      setError(e as ApiError);
    }
  };

  const go = async (email: string, role: Me['role']) => {
    setBusy(email);
    try {
      await changeBaseUrl(url);
      await login(email, role);
      router.replace('/');
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ marginTop: space(8), marginBottom: space(6) }}>
        <T size={40} weight="800" color={colors.accent}>DIBS</T>
        <T size={16} color={colors.muted}>가능성을 먼저 발견하다</T>
      </View>

      <H2>서버 주소</H2>
      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ backgroundColor: colors.deepest, color: colors.text, borderRadius: 12, padding: space(4), fontSize: 15 }}
      />
      <Muted style={{ marginTop: space(2) }}>PC에서 서버를 켠 주소예요. 폰과 PC가 같은 와이파이여야 해요.</Muted>
      <Button title="연결 확인" kind="ghost" onPress={check} style={{ marginTop: space(3) }} />
      {health ? <T color={colors.ok} style={{ marginTop: space(2) }}>{health}</T> : null}

      <H2>시연 계정으로 시작</H2>
      {DEMO.map((d) => (
        <Card key={d.email} onPress={() => go(d.email, d.role)}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <T weight="700">{d.label}</T>
              <Muted>{d.desc}</Muted>
            </View>
            <T color={colors.accent}>{busy === d.email ? '…' : '→'}</T>
          </View>
        </Card>
      ))}
      <ErrorBox error={error} />
      <Muted style={{ marginTop: space(4) }}>개발용 로그인이에요. 실서비스는 휴대폰 본인인증으로 바뀌어요.</Muted>
    </Screen>
  );
}
