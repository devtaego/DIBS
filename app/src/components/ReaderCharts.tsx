import { View } from 'react-native';

import { PINK, Txt, color } from '@/ds';

// 펀딩 '미리보기 반응 지표' 차트들. 공개한 지 얼마 안 된 작품도 있어서 null(공개 전 · 데이터 없음)과 0(공개 뒤 아무도 안 봄)을 구분해 그린다.
export type DayReaders = { date: string; readers: number | null };
export type FunnelStep = { no: number; starters: number; completes: number };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const num = (n: number) => n.toLocaleString('ko-KR');

/** 주간 독자 증가율 표시. 공개 14일 전이면 직전 7일이 다 차지 않아 비교하지 않는다. */
export function weeklyText(change: number | null | undefined, trackedDays: number | undefined) {
  if (!trackedDays) return '-';
  if (trackedDays < 14 || change == null) return '비교 전';
  return `${change > 0 ? '+' : ''}${(Math.round(change * 1000) / 10).toFixed(1)}%`;
}

/** 오늘까지 7일 하루 순독자: 막대 7개, 마지막이 오늘. 공개 전 날은 점선 칸. */
export function DailyReadersChart({ days, trackedDays }: { days: DayReaders[]; trackedDays: number }) {
  if (!trackedDays || days.every((d) => d.readers == null)) {
    return <Txt v="label2" w="medium" c={color.labelAlternative} style={{ marginTop: 10 }}>아직 독자 데이터가 없어요. 1화가 공개되면 하루 독자가 쌓여요.</Txt>;
  }
  const max = Math.max(1, ...days.map((d) => d.readers ?? 0));
  const H = 88;
  return (
    <View style={{ marginTop: 12 }} accessibilityLabel={`오늘까지 ${days.length}일 하루 독자 차트`}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {days.map((d, i) => {
          const today = i === days.length - 1;
          return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ height: H, width: '100%', justifyContent: 'flex-end' }}>
                {d.readers == null ? (
                  <View style={{ height: H * 0.2, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: color.lineNormal }} />
                ) : (
                  <View style={{ height: Math.max(3, (d.readers / max) * H), borderRadius: 6, backgroundColor: today ? PINK : 'rgba(229,54,126,0.45)' }}
                    accessibilityLabel={`${today ? '오늘' : md(d.date)} ${num(d.readers)}명`} />
                )}
              </View>
              <Txt v="caption2" w={today ? 'bold' : 'medium'} c={today ? color.labelStrong : color.labelAssistive} style={{ marginTop: 6 }}>{today ? '오늘' : md(d.date)}</Txt>
            </View>
          );
        })}
      </View>
      {days.some((d) => d.readers == null) ? <View style={{ marginTop: 8 }}><Legend dashed label="공개 전" /></View> : null}
    </View>
  );
}

function Legend({ c, label, dashed }: { c?: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={dashed ? { width: 10, height: 10, borderRadius: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: color.labelAssistive }
        : { width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
      <Txt v="caption2" w="medium" c={color.labelAlternative}>{label}</Txt>
    </View>
  );
}

/** 무료 회차별 완독 독자: 1화 완독을 100%로 놓고 회차마다 얼마나 남는지. */
export function EpisodeFunnelChart({ funnel }: { funnel: FunnelStep[] }) {
  const base = funnel[0]?.completes ?? 0;
  if (!base) return <Txt v="label2" w="medium" c={color.labelAlternative} style={{ marginTop: 10 }}>아직 끝까지 본 독자가 없어요.</Txt>;
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      {funnel.map((s) => {
        const pct = Math.round((s.completes / base) * 100);
        return (
          <View key={s.no} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel={`${s.no}화 완독 ${num(s.completes)}명, 1화의 ${pct}%`}>
            <Txt v="caption1" w="bold" c={color.labelNeutral} style={{ width: 26 }}>{s.no}화</Txt>
            <View style={{ flex: 1, height: 14, borderRadius: 999, backgroundColor: color.fillNormal, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: PINK, opacity: 0.45 + 0.55 * (pct / 100) }} />
            </View>
            <Txt v="caption1" w="medium" c={color.labelAlternative} tabular lines={1} style={{ width: 64, textAlign: 'right' }}>{num(s.completes)}명</Txt>
            <Txt v="caption1" w="bold" c={color.labelStrong} tabular style={{ width: 36, textAlign: 'right' }}>{pct}%</Txt>
          </View>
        );
      })}
    </View>
  );
}

/** 목록 카드용 7일 미니 막대. null 은 점으로. */
export function MiniBars({ values, w = 64, h = 24 }: { values: (number | null)[]; w?: number; h?: number }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <View style={{ width: w, height: h, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }} accessibilityElementsHidden>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, height: v == null ? 2 : Math.max(2, (v / max) * h), borderRadius: 2,
          backgroundColor: v == null ? color.lineNormal : i === values.length - 1 ? PINK : 'rgba(229,54,126,0.45)' }} />
      ))}
    </View>
  );
}
