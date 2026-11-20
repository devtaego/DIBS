// 연결 계좌 관리 (키움증권 모의 제휴): 연결·해지, 예치금 확인.
import { router } from 'expo-router';
import { View } from 'react-native';

import { MePage } from '@/components/MePage';
import { Button, Callout, KV, Panel, Txt, color, spacing } from '@/ds';
import { api, type Wallet } from '@/lib/api';
import { nowMs } from '@/lib/now';
import { useKiwoomLink } from '@/lib/prefs';
import { useApi } from '@/lib/useApi';

export default function Account() {
  const [link, setLink] = useKiwoomLink();
  const { data: wallet } = useApi(() => api.get<Wallet>('/wallet'));
  const connect = () => setLink({ linked: true, account: '5012-****-31', at: new Date(nowMs()).toISOString().slice(0, 10) });
  return (
    <MePage title="연결 계좌">
      <View style={{ backgroundColor: '#14104A', borderRadius: 20, padding: spacing.insetXl, gap: spacing.gapL }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gapS }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#E6007E', alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="label1" w="bold" c="#fff">K</Txt>
          </View>
          <Txt v="headline2" w="bold" c="#fff">키움증권</Txt>
          <Txt v="caption1" c="rgba(255,255,255,0.6)">모의 제휴</Txt>
        </View>
        {link.linked ? (
          <>
            <Txt v="title3" w="bold" c="#fff" tabular>{`위탁계좌 ${link.account}`}</Txt>
            <Txt v="caption1" c="rgba(255,255,255,0.7)">{`${link.at} 연결 · 청약 결제와 조각 거래에 쓰여요`}</Txt>
          </>
        ) : (
          <Txt v="body2" c="rgba(255,255,255,0.85)">키움증권 계좌를 연결하면 청약 결제와 조각 거래를 키움에서 바로 할 수 있어요.</Txt>
        )}
      </View>
      {link.linked ? (
        <Panel>
          <KV k="DIBS 예치금" v={`${(wallet?.deposit_available ?? 0).toLocaleString('ko-KR')}원`} strong />
          <KV k="청약 결제" v="키움증권에서 결제" />
          <KV k="정산금 입금" v="연결 계좌로 분기마다" />
        </Panel>
      ) : null}
      <Callout title="모의 제휴 안내">실제 키움증권과 연결되지 않아요. 계좌번호는 시연용이에요.</Callout>
      {link.linked ? (
        <View style={{ gap: spacing.gapS }}>
          <Button label="예치금 충전 · 출금" tone="Assistive" variant="Outlined" onPress={() => router.push('/wallet')} />
          <Button label="연결 해지" tone="Assistive" variant="Outlined" onPress={() => setLink({ linked: false })} />
        </View>
      ) : <Button label="키움증권 계좌 연결하기" onPress={connect} />}
    </MePage>
  );
}
