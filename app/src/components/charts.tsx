import { View } from 'react-native';
import Svg, { Line, Polygon, Polyline } from 'react-native-svg';

import { colors } from '@/lib/theme';

const toPoints = (vals: number[], w: number, h: number, pad = 2) => {
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const span = hi - lo || 1;
  return vals.map((v, i) => `${((i / Math.max(1, vals.length - 1)) * w).toFixed(1)},${(pad + (1 - (v - lo) / span) * (h - pad * 2)).toFixed(1)}`).join(' ');
};

/** 목록용 미니 그래프 (종가 흐름) */
export function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <View style={{ width: 64, height: 28 }} />;
  return (
    <Svg width={64} height={28} viewBox="0 0 64 28">
      <Polyline points={toPoints(values, 64, 28)} fill="none" stroke={up ? colors.rise : colors.fall} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** 종목 화면 선 그래프 + 아래 채움 */
export function AreaChart({ values, up, height = 150 }: { values: number[]; up: boolean; height?: number }) {
  const w = 342;
  const h = 140;
  const pts = values.length >= 2 ? toPoints(values, w, h, 10) : '';
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[40, 80, 120].map((y) => (
        <Line key={y} x1={0} x2={w} y1={y} y2={y} stroke={colors.line} strokeWidth={1} />
      ))}
      {pts ? (
        <>
          <Polygon points={`${pts} ${w},${h} 0,${h}`} fill={up ? colors.riseFill : colors.fallFill} />
          <Polyline points={pts} fill="none" stroke={up ? colors.rise : colors.fall} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : null}
    </Svg>
  );
}
