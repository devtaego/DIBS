// 디비 발자국 출석 (화면설계도 13 MY): 매일 10P, 7일째 해바라기 보너스 +100P.
// 1P = 1원어치 보너스 씨앗이라 100P = 씨앗 1개 (90일 뒤 만료). 하루 빠지면 1일째부터 다시.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { Dibby } from '@/components/dibby';
import { Txt, color } from '@/ds';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';

type Att = { checked: boolean; streak: number; ladder: number[]; filled: number; today_coin: number; week_total: number };
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

function Paw({ state, tilt }: { state: 'done' | 'today' | 'next'; tilt: number }) {
  const fill = state === 'done' ? '#D9779A' : state === 'today' ? '#F6A9BF' : 'none';
  const stroke = state === 'next' ? '#E9B8CA' : 'none';
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${tilt}deg` }] }}>
      <G fill={fill} stroke={stroke} strokeWidth={1.6} strokeDasharray={state === 'next' ? '2.5 2.5' : undefined}>
        <Ellipse cx={12} cy={15.5} rx={5.6} ry={4.8} />
        <Ellipse cx={5.4} cy={9.6} rx={2.1} ry={2.6} />
        <Ellipse cx={9.4} cy={5.6} rx={2.1} ry={2.7} />
        <Ellipse cx={14.6} cy={5.6} rx={2.1} ry={2.7} />
        <Ellipse cx={18.6} cy={9.6} rx={2.1} ry={2.6} />
      </G>
    </Svg>
  );
}

function Sunflower({ done }: { done: boolean }) {
  return (
    <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: done ? '#F2C94C' : '#FFF4D6', borderWidth: 1.5, borderColor: '#F2C94C', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <G fill={done ? '#FFFFFF' : '#F2B530'}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => <Ellipse key={r} cx={12} cy={5} rx={2.6} ry={4.4} transform={`rotate(${r} 12 12)`} />)}
        </G>
        <Circle cx={12} cy={12} r={4} fill="#7A4A2A" />
      </Svg>
    </View>
  );
}

export function AttendanceCard({ onDone }: { onDone?: () => void; coin?: number }) {
  const { data, setData } = useApi(() => api.get<Att>('/me/attendance'));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data?.ladder) return null;
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post<Att & { granted: number }>('/me/attendance');
      setData(r);
      setMsg(r.granted > 10 ? `해바라기 보너스까지 ${r.granted}P를 받았어요` : `${r.granted}P를 받았어요`);
      onDone?.();
    } catch (e) { setMsg((e as ApiError).message); } finally { setBusy(false); }
  };
  const todayIdx = data.checked ? data.filled - 1 : data.filled;
  const n = data.ladder.length;
  const left = n - 1 - todayIdx; // 해바라기까지 남은 발자국
  const bonus = data.ladder[n - 1] - data.ladder[0];
  return (
    <View accessibilityLabel="디비 발자국 출석체크" style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, borderRadius: 22, backgroundColor: '#FFF6F9', borderWidth: 1, borderColor: '#F6D6E2', overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt v="label1" w="bold" c={color.labelStrong}>디비 발자국 출석</Txt>
            {data.streak ? <View style={{ height: 20, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#FDEBF1', justifyContent: 'center' }}><Txt v="caption2" w="bold" c="#C4426F">{data.streak}일째 콩콩</Txt></View> : null}
          </View>
          <Txt v="caption1" w="medium" c={color.labelAlternative} style={{ marginTop: 3 }}>매일 {data.ladder[0]}P · 100P마다 씨앗 1개가 돼요</Txt>
        </View>
        <View style={{ marginTop: -6, marginRight: -2, marginBottom: -4 }}><Dibby pose="jump" size={52} /></View>
      </View>

      <View style={{ marginVertical: 12, paddingTop: 4, paddingHorizontal: 2 }}>
        <Svg width="100%" height={44} viewBox="0 0 320 44" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, top: 6 }}>
          <Path d="M10 14 C 40 30, 60 30, 80 14 S 120 0, 160 18 S 220 34, 250 16 S 300 6, 312 22" fill="none" stroke="#F3CFDC" strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {data.ladder.map((_, i) => {
            const st = i < (data.checked ? data.filled : todayIdx) ? 'done' : i === todayIdx ? 'today' : 'next';
            const last = i === n - 1;
            return (
              <View key={i} style={{ alignItems: 'center', gap: 4, width: 36, marginTop: i % 2 ? 14 : 0 }}>
                {last ? <Sunflower done={st === 'done' || (st === 'today' && data.checked)} /> : (
                  <View>
                    {st === 'today' && !data.checked ? <View style={{ position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, borderRadius: 999, backgroundColor: '#FDE3EC' }} /> : null}
                    <Paw state={st === 'today' && data.checked ? 'done' : st} tilt={i % 2 ? 14 : -14} />
                  </View>
                )}
                <Txt v="caption2" w={st === 'today' || last ? 'bold' : 'medium'} c={last ? '#B7791F' : st === 'today' ? '#C4426F' : st === 'done' ? color.labelAlternative : color.labelAssistive}>
                  {last ? `+${bonus}P` : st === 'today' ? '오늘' : DAYS[i]}
                </Txt>
              </View>
            );
          })}
        </View>
      </View>

      {left > 0 ? (
        <View style={{ marginBottom: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#FFF9EC' }}>
          <Txt v="caption1" w="medium" c="#8A5A12">발자국 {left}개 더 찍으면 <Txt v="caption1" w="bold" c="#8A5A12">해바라기 보너스 {bonus}P</Txt></Txt>
        </View>
      ) : null}
      <Pressable onPress={go} disabled={data.checked || busy} accessibilityRole="button" accessibilityState={{ disabled: data.checked }}
        style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: data.checked ? color.interactionDisable : '#F6A9BF', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
        <Txt v="label1" w="bold" c={data.checked ? color.labelDisable : '#5B1A33'}>{data.checked ? '오늘 발자국 찍었어요' : `오늘 발자국 찍고 ${data.today_coin}P 받기`}</Txt>
      </Pressable>
      {msg ? <Txt v="caption1" w="medium" c={color.labelAlternative} center style={{ marginTop: 8 }}>{msg}</Txt> : null}
    </View>
  );
}
