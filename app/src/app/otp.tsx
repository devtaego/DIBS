import type React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { BigBtn, Icon, SubHeader, Txt, V2Screen, color, PINK } from '@/ds';
import { api, type ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { finishLogin } from '@/lib/social';

// 02 인증번호 입력: 6칸, 남은 시간, 다시 받기
export default function Otp() {
  const p = useLocalSearchParams<{ phone: string; dev?: string; ttl?: string }>();
  const { loginWithToken } = useSession();
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(Number(p.ttl ?? 180));
  const [dev, setDev] = useState(p.dev ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const verify = async (c = code) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ access_token: string; is_new: boolean }>('/auth/phone/verify', { phone: p.phone, code: c });
      if (await loginWithToken(r.access_token)) finishLogin(r.is_new);
    } catch (e) {
      setErr((e as ApiError).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const r = await api.post<{ expires_in: number; dev_code: string | null }>('/auth/phone/request', { phone: p.phone });
      setLeft(r.expires_in);
      setDev(r.dev_code ?? '');
      setErr(null);
      setCode('');
    } catch (e) {
      setErr((e as ApiError).message);
    }
  };

  const mm = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  return (
    <V2Screen header={<SubHeader title="인증번호 입력" />} pad={24}
      footer={<BigBtn label={busy ? '확인 중…' : '확인'} disabled={code.length !== 6 || busy || left === 0} onPress={() => verify()} h={52} />}>
      <View style={{ gap: 16, marginTop: 4 }}>
        <Txt v="title3" w="bold" c={color.labelStrong}>문자로 받은 6자리를 입력해 주세요</Txt>
        <Txt v="label2" c={color.labelNeutral}>{p.phone}으로 보냈어요</Txt>
        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="인증번호 입력칸" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const focused = i === code.length;
            return (
              <View key={i} style={{ width: 48, height: 56, borderRadius: 12, borderWidth: focused ? 2 : 1, borderColor: err ? color.negative : focused ? PINK : color.lineNeutral, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bgNormal }}>
                <Txt v="title3" w="bold" c={color.labelStrong}>{code[i] ?? ''}</Txt>
              </View>
            );
          })}
        </Pressable>
        <TextInput ref={input} value={code} autoFocus keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="sms-otp"
          onChangeText={(t) => { const c = t.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6) verify(c); }}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt v="caption1" w="medium" c={left === 0 ? color.negative : color.labelAlternative}>{left === 0 ? '시간이 지났어요. 다시 받아 주세요' : `남은 시간 ${mm}`}</Txt>
          <Pressable onPress={resend} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 }}>
            <Icon name="refresh" size={16} c={color.labelAlternative} />
            <Txt v="label2" w="semibold" c={color.labelAlternative}>다시 받기</Txt>
          </Pressable>
        </View>
        {err ? <Txt v="label2" w="medium" c={color.negative}>{err}</Txt> : null}
        {dev ? <Txt v="caption1" c={color.labelAssistive}>개발 환경이라 문자 대신 보여 드려요: {dev}</Txt> : null}
      </View>
    </V2Screen>
  );
}
