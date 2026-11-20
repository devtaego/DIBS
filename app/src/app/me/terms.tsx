// 약관 · 개인정보 처리방침 (시연용 요약)
import { useState } from 'react';
import { View } from 'react-native';

import { Fold, MePage } from '@/components/MePage';
import { Txt, color } from '@/ds';

const DOCS: [string, string, string][] = [
  ['서비스 이용약관', '2027.03.02 시행', 'DIBS는 웹툰·웹소설을 보고, 작품 수익에 대한 조각에 투자할 수 있는 서비스예요. 회원은 정확한 정보로 가입해야 하고, 다른 사람의 계정을 쓰면 안 돼요.'],
  ['조각투자 거래약관', '2027.03.02 시행', '조각의 청약·배정·상장·거래·정산·권리 종료 절차를 정해요. 결제와 보관은 제휴 증권사가 맡고, DIBS는 작품 정보와 수익 자료를 공시해요.'],
  ['투자위험 고지', '청약 전 확인 필수', '조각은 원금 손실이 날 수 있는 상품이고 예금자 보호 대상이 아니에요. 작품 수익이 낮으면 정산금이 적거나 없을 수 있어요.'],
  ['개인정보 처리방침', '2027.03.02 시행', '가입·본인확인·청약·정산에 필요한 정보만 모아요. 증권 계좌 연결에 필요한 정보는 제휴 증권사와만 주고받고, 법령이 정한 기간이 지나면 지워요.'],
  ['마케팅 정보 수신 동의 (선택)', '알림 설정에서 바꿀 수 있어요', '새 작품 소개와 이벤트 소식을 알림으로 보내 드려요. 동의하지 않아도 서비스를 쓸 수 있어요.'],
];

export default function Terms() {
  const [openT, setOpenT] = useState<number | null>(null);
  return (
    <MePage title="약관 · 개인정보 처리방침">
      <View>
        {DOCS.map(([t, sub, body], i) => (
          <Fold key={t} icon="cDoc" title={t} sub={sub} last={i === DOCS.length - 1} open={openT === i} onToggle={() => setOpenT(openT === i ? null : i)}><Txt v="body2" c={color.labelNeutral}>{body}</Txt></Fold>
        ))}
      </View>
    </MePage>
  );
}
