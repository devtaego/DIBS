import { router } from 'expo-router';
import { View } from 'react-native';

import { Dibby } from '@/components/dibby';
import { BigBtn, HeadBtn, Line, Txt, V2Screen, color } from '@/ds';
import { type Wallet } from '@/lib/api';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';

// 01 가입 완료
export default function Welcome() {
  const { me } = useSession();
  const { data } = useApi(async () => {
    const [w, dibs] = await Promise.all([api.get<Wallet>('/wallet'), api.get<unknown[]>('/me/dibs')]);
    return { w, dibs: dibs.length };
  }, [me?.id]);
  return (
    <V2Screen pad={24}
      header={<View style={{ height: 56, flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 8 }}><HeadBtn icon="close" label="닫기" onPress={() => router.replace('/')} /></View>}
      footer={<BigBtn label="작품 둘러보기" onPress={() => router.replace('/')} h={52} />}>
      <View style={{ alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Dibby pose="hello" size={180} />
        <Txt v="title3" w="bold" c={color.labelStrong} center>{me?.nickname ?? '회원'}님, 환영해요</Txt>
        <Txt v="label2" c={color.labelNeutral} center>관심 작품을 찜하면 펀딩이 열릴 때 알려 드려요</Txt>
      </View>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: color.lineAlternative, paddingHorizontal: 16, paddingVertical: 6 }}>
        <Line k="예치금" v={`${(data?.w.deposit_available ?? 0).toLocaleString('ko-KR')}원`} />
        <Line k="관심 작품" v={`${data?.dibs ?? 0}개`} />
        <Line k="본인인증" v={me?.kyc_verified ? '완료' : '펀딩 전에 해요'} vc={me?.kyc_verified ? color.positive : color.labelAlternative} />
      </View>
    </V2Screen>
  );
}
