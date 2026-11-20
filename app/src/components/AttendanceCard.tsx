// 출석 체크: 7일 사다리 (50·50·200·50·50·50·300코인). 3일째 1화, 7일이면 2.5화 분량. 코인은 유료 회차 열람 전용.
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Panel, Txt, color, spacing } from '@/ds';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';

type Att = { checked: boolean; streak: number; ladder: number[]; filled: number; today_coin: number; week_total: number };

export function AttendanceCard({ onDone, coin }: { onDone?: () => void; coin?: number }) {
  const { data, setData } = useApi(() => api.get<Att>('/me/attendance'));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data?.ladder) return null;
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post<Att & { granted: number }>('/me/attendance');
      setData(r);
      setMsg(`${r.granted.toLocaleString('ko-KR')}코인을 받았어요`);
      onDone?.();
    } catch (e) { setMsg((e as ApiError).message); } finally { setBusy(false); }
  };
  const todayIdx = data.checked ? data.filled - 1 : data.filled; // 오늘 칸
  const nextBig = data.ladder.findIndex((v, i) => i > todayIdx && v >= 200);
  const hint = nextBig > 0 ? `${nextBig - todayIdx}일 뒤 ${data.ladder[nextBig]}코인` : '내일부터 새 주가 시작돼요';
  return (
    <Panel style={{ gap: spacing.gapM }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="label1" w="bold" c={color.labelStrong}>{`출석 체크 · ${data.streak ? `${data.streak}일 연속` : '오늘 첫 출석'}`}</Txt>
        {coin != null ? <Txt v="caption1" w="semibold" c={color.labelAlternative}>{`보유 ${coin.toLocaleString('ko-KR')}코인`}</Txt> : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {data.ladder.map((v, i) => {
          const on = i < data.filled;
          const today = i === todayIdx;
          const big = v >= 200;
          return (
            <View key={i} style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? color.primaryNormal : big ? '#FDEBF1' : color.bgAlternative,
                borderWidth: today && !on ? 2 : 0, borderColor: color.primaryNormal }}>
                <Txt v="caption2" w="bold" c={on ? '#fff' : big ? color.primaryNormal : color.labelAlternative} tabular>{on ? '✓' : v}</Txt>
              </View>
              <Txt v="caption2" w={today ? 'bold' : 'regular'} c={today ? color.labelStrong : color.labelAssistive}>{today ? '오늘' : `${i + 1}일`}</Txt>
            </View>
          );
        })}
      </View>
      <Button label={data.checked ? '오늘 출석 완료' : `출석하고 ${data.today_coin}코인 받기`} size="Medium" disabled={data.checked || busy} onPress={go} />
      <Txt v="caption1" c={color.labelAlternative}>{msg ? `${msg} · ${hint}` : `${hint} · 7일 모으면 ${data.week_total}코인(유료 2.5화) · 코인은 열람 전용`}</Txt>
    </Panel>
  );
}
