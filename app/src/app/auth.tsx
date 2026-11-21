import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Loading } from '@/components/ui';
import { Txt, color } from '@/ds';
import { useSession } from '@/lib/session';

// 간편 로그인이 끝나고 돌아오는 주소 (/auth?token=…&is_new=1 또는 ?error=…)
// 웹은 페이지째 돌아오고, 앱은 인증 세션이 결과를 직접 받지만 딥링크로 이 화면이 열려도 같은 일을 한다.
export default function AuthReturn() {
  const p = useLocalSearchParams<{ token?: string; is_new?: string; error?: string }>();
  const { loginWithToken, me } = useSession();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      if (p.token) {
        const user = await loginWithToken(p.token);
        router.replace(user ? (p.is_new === '1' ? '/welcome' : '/') : '/login');
      } else {
        router.replace(me ? '/' : '/login');
      }
    })();
  }, [p.token, p.is_new, loginWithToken, me]);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: color.bgNormal }}>
      <Loading />
      <Txt v="label1" c={color.labelAlternative}>{p.error ? '로그인을 취소했어요' : '로그인하는 중이에요'}</Txt>
    </View>
  );
}
