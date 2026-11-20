// 출석 체크: 매일 열람 코인 100 (7일 연속이면 +300). 코인은 유료 회차 열람 전용.
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Panel, Txt, color, spacing } from '@/ds';
import { api, ApiError } from '@/lib/api';
import { nowMs } from '@/lib/now';
import { useApi } from '@/lib/useApi';

type Att = { checked: boolean; streak: number; week: boolean[]; coin: number; bonus_days: number; bonus: number };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function AttendanceCard({ onDone, coin }: { onDone?: () => void; coin?: number }) {
  const { data, setData } = useApi(() => api.get<Att>('/me/attendance'));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const today = new Date(nowMs()).getDay();
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post<Att & { granted: number }>('/me/attendance');
      setData(r);
      setMsg(`${r.granted.toLocaleString('ko-KR')}코인을 받았어요`);
      onDone?.();
    } catch (e) { setMsg((e as ApiError).message); } finally { setBusy(false); }
  };
  const left = data.bonus_days - (data.streak % data.bonus_days || (data.checked ? data.bonus_days : 0));
  return (
    <Panel style={{ gap: spacing.gapM }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="label1" w="bold" c={color.labelStrong}>출석 체크</Txt>
        <Txt v="caption1" w="semibold" c={color.primaryNormal}>{`${data.streak ? `${data.streak}일 연속` : '오늘 첫 출석'}${coin != null ? ` · 보유 ${coin.toLocaleString('ko-KR')}코인` : ''}`}</Txt>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {data.week.map((on, i) => {
          const isToday = i === 6;
          return (
            <View key={i} style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? color.primaryNormal : color.bgAlternative, borderWidth: isToday && !on ? 1.5 : 0, borderColor: color.primaryNormal }}>
                <Txt v="caption2" w="bold" c={on ? '#fff' : color.labelAssistive}>{on ? '✓' : `+${data.coin}`}</Txt>
              </View>
              <Txt v="caption2" c={isToday ? color.labelStrong : color.labelAssistive}>{isToday ? '오늘' : DAYS[(today + i + 1) % 7]}</Txt>
            </View>
          );
        })}
      </View>
      <Button label={data.checked ? '오늘 출석 완료' : `출석하고 ${data.coin}코인 받기`} size="Medium" disabled={data.checked || busy} onPress={go} />
      <Txt v="caption1" c={msg && !data.checked ? color.negative : color.labelAlternative}>
        {msg || `${left > 0 ? `${left}일 더 출석하면 보너스 ${data.bonus}코인` : `오늘 ${data.bonus_days}일 연속 보너스!`} · 코인은 유료 회차 열람에만 써요`}
      </Txt>
    </Panel>
  );
}
