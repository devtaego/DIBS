import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, ErrorBox, Muted, Screen, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

const QUESTIONS: { q: string; options: string[] }[] = [
  { q: '투자 경험이 얼마나 되나요?', options: ['없어요', '1년 미만', '1~3년', '3년 이상'] },
  { q: '투자한 돈이 30% 줄면 어떻게 하실 건가요?', options: ['바로 판다', '일부 판다', '그대로 둔다', '더 산다'] },
  { q: '이 투자금이 전체 자산에서 차지하는 비중은?', options: ['30% 이상', '10~30%', '5~10%', '5% 미만'] },
  { q: '원하는 투자 기간은?', options: ['6개월 이내', '1년', '2~3년', '3년 이상'] },
  { q: '원금 손실 가능성을 어디까지 받아들일 수 있나요?', options: ['손실 싫음', '10%까지', '30%까지', '전액도 감수'] },
];

export default function RiskProfile() {
  const { refreshMe } = useSession();
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/me/risk-profile', { answers });
      await refreshMe();
      router.back();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Muted>DIBS 조각은 검증 전 신작에 투자하는 고위험 상품이에요. 청약·매수 전에 한 번 확인해요.</Muted>
      {QUESTIONS.map((item, qi) => (
        <View key={item.q} style={{ marginTop: space(6) }}>
          <T weight="700">{qi + 1}. {item.q}</T>
          {item.options.map((opt, oi) => {
            const on = answers[qi] === oi + 1;
            return (
              <Pressable
                key={opt}
                onPress={() => setAnswers(answers.map((a, i) => (i === qi ? oi + 1 : a)))}
                style={{ marginTop: space(2), padding: space(3.5), borderRadius: 12, backgroundColor: on ? colors.button : colors.card }}>
                <T color={on ? colors.deepest : colors.text} weight={on ? '700' : '400'}>{opt}</T>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ height: space(6) }} />
      <ErrorBox error={error} />
      <Button title="확인 완료" onPress={submit} disabled={answers.some((a) => a === null)} loading={busy} />
    </Screen>
  );
}
