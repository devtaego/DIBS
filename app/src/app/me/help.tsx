// 고객센터 · 자주 묻는 질문
import { useState } from 'react';
import { View } from 'react-native';

import { Fold, MePage } from '@/components/MePage';
import { Button, Callout, GroupLabel, Toast, Txt, color } from '@/ds';

const FAQ: [string, string][] = [
  ['조각이 뭔가요?', '웹툰·웹소설 작품이 앞으로 벌어들일 수익에 대한 권리를 작게 나눈 단위예요. 1조각은 1만 원이고, 가진 조각 수만큼 분기마다 수익을 나눠 받아요.'],
  ['만기가 있나요?', '정해진 만기는 없어요. 상장된 동안 분기마다 연재 순매출의 30%(판권·굿즈·해외 수익은 25%)를 조각 수대로 나눠 받고, 언제든 마켓에서 팔 수 있어요. 작가가 매입하거나 상장 폐지되면 그때 권리가 끝나요.'],
  ['모집 금액보다 청약이 많이 들어오면요?', '목표 수량까지만 발행하고, 신청한 분들께 나눠서 배정해요. 배정받지 못한 금액은 마감 후 돌려드려요.'],
  ['목표에 못 미치면요?', '펀딩이 성립하지 않고, 청약 금액은 전액 돌려드려요.'],
  ['청약을 취소하거나 수량을 바꿀 수 있나요?', '마감 1시간 전까지는 언제든 바꾸거나 취소할 수 있어요.'],
  ['원금이 보장되나요?', '아니요. 작품 수익에 따라 원금 손실이 날 수 있고, 예금자 보호 대상이 아니에요. 투자성향 확인 결과도 함께 참고해 주세요.'],
  ['상장된 조각은 어디서 사고팔아요?', '토큰증권 탭에서 다른 투자자와 거래할 수 있어요. 결제와 보관은 제휴 증권사인 키움증권이 맡아요.'],
];

export default function Help() {
  const [toast, setToast] = useState(false);
  const [openQ, setOpenQ] = useState<number | null>(null); // 한 질문을 열면 다른 질문은 닫힌다
  return (
    <MePage title="고객센터">
      <View>
        <GroupLabel>자주 묻는 질문</GroupLabel>
        {FAQ.map(([q, a], i) => (
          <Fold key={q} title={q} last={i === FAQ.length - 1} open={openQ === i} onToggle={() => setOpenQ(openQ === i ? null : i)}><Txt v="body2" c={color.labelNeutral}>{a}</Txt></Fold>
        ))}
      </View>
      <Callout title="1:1 문의">평일 10:00 ~ 18:00 (점심 12:30 ~ 13:30) · 답변은 알림으로 보내 드려요.</Callout>
      <Button label="1:1 문의하기" variant="Outlined" tone="Assistive" onPress={() => { setToast(true); setTimeout(() => setToast(false), 1800); }} />
      <Toast text="문의가 접수됐어요" visible={toast} />
    </MePage>
  );
}
