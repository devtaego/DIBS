import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Dibby } from '@/components/dibby';
import { ErrorBox } from '@/components/ui';
import { Button, Callout, DScreen, PageTitle, Panel, TopAppBar, Txt, color, radius, spacing } from '@/ds';
import { api, ApiError } from '@/lib/api';
import { PRODUCT_RISK, RISK_INFO, RISK_ORDER, fitsProduct, scoreToLevel, type RiskLevel } from '@/lib/risk';
import { useSession } from '@/lib/session';

const QUESTIONS: { q: string; options: string[] }[] = [
  { q: '투자 경험이 얼마나 되나요?', options: ['없어요', '1년 미만', '1~3년', '3년 이상'] },
  { q: '투자한 돈이 30% 줄면 어떻게 하실 건가요?', options: ['바로 판다', '일부 판다', '그대로 둔다', '더 산다'] },
  { q: '이 투자금이 전체 자산에서 차지하는 비중은?', options: ['30% 이상', '10~30%', '5~10%', '5% 미만'] },
  { q: '원하는 투자 기간은?', options: ['6개월 이내', '1년', '2~3년', '3년 이상'] },
  { q: '원금 손실 가능성을 어디까지 받아들일 수 있나요?', options: ['손실 싫음', '10%까지', '30%까지', '전액도 감수'] },
];

// 투자성향 확인 (청약·매수 전 필수): 5문항 → 점수 → 5단계 성향 결과 + 이 상품(매우 높은 위험)과 맞는지
export default function RiskProfile() {
  const { me, refreshMe } = useSession();
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<RiskLevel | null>(null);
  const done = answers.filter((a) => a !== null).length;

  const submit = async () => {
    setBusy(true);
    try {
      const score = answers.reduce<number>((a, b) => a + (b ?? 0), 0);
      const res = await api.post<{ risk_level?: string }>('/me/risk-profile', { answers });
      await refreshMe();
      setResult(((res?.risk_level as RiskLevel) || scoreToLevel(score)));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const header = <TopAppBar type="Modal" title="투자성향 확인" />;

  if (result) {
    const info = RISK_INFO[result];
    const fit = fitsProduct(result);
    const idx = RISK_ORDER.indexOf(result);
    return (
      <DScreen header={header} footer={<Button label={fit ? '확인했어요' : '확인하고 계속하기'} onPress={() => router.back()} />}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ alignItems: 'center', gap: spacing.gapM, paddingTop: spacing.insetL }}>
          <Dibby pose={fit ? 'jump' : 'careful'} size={110} />
          <Txt v="body2" c={color.labelAlternative}>{`${me?.nickname ?? '회원'}님의 투자성향은`}</Txt>
          <Txt v="title2" w="bold" c={color.labelStrong}>{info.label}</Txt>
          <Txt v="label2" c={color.labelNeutral} style={{ textAlign: 'center' }}>{info.desc}</Txt>
        </View>

        {/* 5단계 막대: 내 위치 표시 */}
        <Panel>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {RISK_ORDER.map((k, i) => (
              <View key={k} style={{ flex: 1, gap: 6, alignItems: 'center' }}>
                <View style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: i <= idx ? color.primaryNormal : color.fillNormal }} />
                <Txt v="caption2" w={i === idx ? 'bold' : 'regular'} c={i === idx ? color.labelStrong : color.labelAlternative}>{RISK_INFO[k].label}</Txt>
              </View>
            ))}
          </View>
        </Panel>

        <Panel>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt v="label2" c={color.labelAlternative}>DIBS 조각 위험 등급</Txt>
            <Txt v="label2" w="bold" c={color.negative}>{`${PRODUCT_RISK.grade}등급 · ${PRODUCT_RISK.label}`}</Txt>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt v="label2" c={color.labelAlternative}>내 성향에 맞는 등급</Txt>
            <Txt v="label2" w="bold" c={color.labelStrong}>{`${5 - idx}등급 이하`}</Txt>
          </View>
        </Panel>

        {fit ? (
          <Callout title="성향에 맞는 상품이에요">검증 전 작품에 투자하는 상품이라 원금을 잃을 수 있어요. 여유 자금으로만 투자하세요.</Callout>
        ) : (
          <Callout tone="Caution" title="투자성향보다 위험한 상품이에요">
            {`${info.label}에게 DIBS 조각은 부적합 상품이에요. 그래도 투자하려면 청약 화면에서 '부적합 확인'에 동의해야 해요.`}
          </Callout>
        )}
        <Button label="다시 검사하기" variant="Text" tone="Assistive" size="Small" onPress={() => { setResult(null); setAnswers(QUESTIONS.map(() => null)); }} />
      </DScreen>
    );
  }

  return (
    <DScreen
      header={header}
      footer={<Button label={`결과 보기 (${done}/${QUESTIONS.length})`} onPress={submit} disabled={done < QUESTIONS.length} loading={busy} />}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageTitle title="투자 전에 성향을 확인해요" sub="DIBS 조각은 검증 전 신작에 투자하는 매우 높은 위험 상품이에요. 5문항이면 끝나요." />
      {QUESTIONS.map((item, qi) => (
        <View key={item.q} style={{ gap: spacing.gapM }}>
          <Txt v="body1" w="bold" c={color.labelStrong}>{`${qi + 1}. ${item.q}`}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gapS }}>
            {item.options.map((opt, oi) => {
              const on = answers[qi] === oi + 1;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setAnswers(answers.map((a, i) => (i === qi ? oi + 1 : a)))}
                  style={{ width: '48.5%', paddingVertical: spacing.insetM, paddingHorizontal: spacing.insetL, borderRadius: radius.control, borderWidth: on ? 2 : 1, borderColor: on ? color.primaryNormal : color.lineNormal, backgroundColor: on ? '#FDEBF1' : color.bgNormal }}>
                  <Txt v="label1" w={on ? 'bold' : 'medium'} c={on ? color.primaryStrong : color.labelNormal}>{opt}</Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <ErrorBox error={error} />
    </DScreen>
  );
}
