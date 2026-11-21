// 간편 로그인 (카카오·네이버·구글)
// 앱은 서버가 준 동의 화면 주소를 인증 세션 브라우저로 열기만 하고, 코드 교환은 서버가 한다 (backend app/api/social.py).
// 서버에 키가 없으면 서버가 모의 동의 화면을 띄워 같은 흐름을 그대로 탄다.
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { api } from './api';
import { DEMO } from './demo';

export type Provider = 'kakao' | 'naver' | 'google';
export const PROVIDER_LABEL: Record<Provider, string> = { kakao: '카카오', naver: '네이버', google: '구글' };

export type SocialResult = { token: string; isNew: boolean } | { error: string } | null;

/** 돌아올 앱 주소: 웹은 같은 사이트의 /auth, 앱은 dibs://auth (Expo Go 는 exp://…/--/auth) */
export function authRedirect() {
  return Platform.OS === 'web' ? `${window.location.origin}/auth` : Linking.createURL('auth');
}

export function parseAuthUrl(url: string): SocialResult {
  const q = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
  if (q.get('error')) return { error: q.get('error')! };
  const token = q.get('token');
  return token ? { token, isNew: q.get('is_new') === '1' } : null;
}

/**
 * 간편 로그인 시작.
 * - 앱: 인증 세션 브라우저가 닫히면 결과(토큰)를 돌려준다.
 * - 웹: 페이지를 동의 화면으로 넘기므로 null 을 돌려주고, 돌아오면 /auth 화면이 마무리한다.
 */
export async function startSocialLogin(provider: Provider): Promise<SocialResult> {
  if (DEMO) {
    const r = await api.post<{ access_token: string; is_new: boolean }>(`/auth/social/${provider}/token`, { access_token: 'mock:demo' });
    return { token: r.access_token, isNew: r.is_new };
  }
  const redirect = authRedirect();
  const st = await api.get<{ authorize_url: string; mock: boolean }>(`/auth/social/${provider}/start`, { redirect_uri: redirect });
  if (Platform.OS === 'web') {
    window.location.assign(st.authorize_url);
    return null;
  }
  const res = await WebBrowser.openAuthSessionAsync(st.authorize_url, redirect);
  if (res.type !== 'success') return { error: 'cancelled' };
  return parseAuthUrl(res.url);
}

/** 로그인 뒤 이동: 새로 가입했으면 가입 완료 화면, 아니면 홈 */
export function finishLogin(isNew: boolean) {
  router.replace(isNew ? '/welcome' : '/');
}
