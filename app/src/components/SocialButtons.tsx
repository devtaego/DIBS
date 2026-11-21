import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { color } from '@/ds';
import { PROVIDER_LABEL, startSocialLogin, type Provider, type SocialResult } from '@/lib/social';

// 간편 로그인 단추: 각 회사의 표기 규칙에 맞춘 색 (카카오 노랑 · 네이버 초록 · 구글 흰 바탕)
const STYLE: Record<Provider, { bg: string; fg: string; mark: string; line?: string }> = {
  kakao: { bg: '#FEE500', fg: 'rgba(0,0,0,0.85)', mark: '💬' },
  naver: { bg: '#03C75A', fg: '#FFFFFF', mark: 'N' },
  google: { bg: '#FFFFFF', fg: '#1F1F1F', mark: 'G', line: color.lineNeutral },
};

export function SocialButtons({ onResult, providers = ['kakao', 'naver', 'google'] }: { onResult: (r: SocialResult) => void; providers?: Provider[] }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const go = async (p: Provider) => {
    setBusy(p);
    try {
      onResult(await startSocialLogin(p));
    } catch (e) {
      onResult({ error: (e as Error).message || 'failed' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      {providers.map((p) => {
        const st = STYLE[p];
        return (
          <Pressable key={p} onPress={() => go(p)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`${PROVIDER_LABEL[p]}로 계속하기`}
            style={({ pressed }) => ({ height: 52, borderRadius: 12, backgroundColor: st.bg, borderWidth: st.line ? 1 : 0, borderColor: st.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
            {busy === p ? <ActivityIndicator color={st.fg} /> : (
              <>
                <Text style={{ fontFamily: 'Pretendard-Bold', fontSize: p === 'kakao' ? 16 : 17, color: p === 'google' ? '#4285F4' : st.fg }}>{st.mark}</Text>
                <Text style={{ fontFamily: 'Pretendard-SemiBold', fontSize: 16, color: st.fg }}>{PROVIDER_LABEL[p]}로 계속하기</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
