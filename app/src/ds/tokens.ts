// DIBS Design System v2.0 토큰 (디자인 시스템 아티팩트 ⓪ Foundation 기준)
// 규칙: 화면·컴포넌트는 아래 semantic 값만 쓴다. v2.0은 전 화면 화이트, 쇼츠만 다크.

export const color = {
  primaryNormal: '#DE5786',
  primaryStrong: '#C4426F',
  primaryHeavy: '#9C3F66',
  // Button Solid Primary는 연한 핑크 면 + 진한 글자 (v2.0 단색 핑크)
  primarySoft: '#F6A9BF',
  primarySoftPressed: '#EE93AE',
  onPrimarySoft: '#5B1A33',

  labelStrong: '#191F28',
  labelNormal: '#333D4B',
  labelNeutral: '#4E5968',
  labelAlternative: '#6B7684',
  labelAssistive: '#8B95A1',
  labelDisable: '#C9CED5',

  bgNormal: '#FFFFFF',
  bgAlternative: '#F4F5F7',
  elevatedNormal: '#FFFFFF',
  elevatedAlternative: '#F4F5F7',
  elevatedStrong: '#EEF0F3',
  elevatedHeavy: '#E2E5E9',
  bgTransparent: 'rgba(255,255,255,0.88)',

  interactionInactive: '#8B95A1',
  interactionDisable: '#E2E5E9',

  lineNormal: 'rgba(0,0,0,0.12)',
  lineNeutral: 'rgba(0,0,0,0.16)',
  lineAlternative: 'rgba(0,0,0,0.08)',
  lineSolid: '#E2E5E9',

  positive: '#12B76A',
  cautionary: '#D98A00',
  negative: '#F04452',

  rise: '#F04452',
  fall: '#3182F6',
  riseFill: 'rgba(240,68,82,0.12)',
  fallFill: 'rgba(49,130,246,0.12)',
  webtoon: '#7C5CD6',
  highlight: '#C4426F',
  highlightFill: 'rgba(222,87,134,0.12)',

  inversePrimary: '#EDB3C6',
  inverseBackground: '#191F28',
  inverseLabel: '#FFFFFF',

  white: '#FFFFFF',
  black: '#000000',

  fillNormal: 'rgba(0,0,0,0.08)',
  fillStrong: 'rgba(0,0,0,0.16)',
  fillAlternative: 'rgba(0,0,0,0.12)',
  imageDim: 'rgba(0,0,0,0.08)',
  dimmer: 'rgba(0,0,0,0.52)',

  // 쇼츠 전용 다크 면
  shortsBg: '#0E0F17',
  shortsLabel: '#F3E8EE',
  shortsActiveFill: '#FBD9E3',
  shortsActiveLabel: '#C4426F',
} as const;

export const spacing = {
  screen: 24,
  section: 32,
  item: 12,
  gap2xs: 2,
  gapXs: 4,
  gapS: 6,
  gapM: 8,
  gapL: 12,
  gapXl: 16,
  gap2xl: 20,
  gap3xl: 24,
  insetXs: 4,
  insetS: 8,
  insetM: 12,
  insetL: 16,
  insetXl: 20,
  inset2xl: 24,
  inset3xl: 32,
} as const;

export const radius = { tag: 4, thumb: 8, control: 12, card: 16, sheet: 20, chip: 999 } as const;

export const shadow = {
  card: { shadowColor: '#191F28', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  large: { shadowColor: '#191F28', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

// Text Style: 크기 / 줄간격(%) / 자간(em)
const scale = {
  display1: [44, 120, -0.035],
  title1: [32, 125, -0.03],
  title2: [28, 128, -0.028],
  title3: [24, 136, -0.025],
  heading1: [22, 136, -0.022],
  heading2: [20, 140, -0.02],
  headline1: [18, 140, -0.018],
  headline2: [17, 141, -0.015],
  body1: [16, 150, -0.012],
  body2: [15, 147, -0.01],
  label1: [14, 143, -0.006],
  label2: [13, 146, -0.004],
  caption1: [12, 150, 0],
  caption2: [11, 145, 0],
} as const;

export type TextVariant = keyof typeof scale;
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export const FONT: Record<TextWeight, string> = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
};
const WEIGHT: Record<TextWeight, '400' | '500' | '600' | '700'> = { regular: '400', medium: '500', semibold: '600', bold: '700' };

export function textStyle(v: TextVariant, w: TextWeight = 'regular') {
  const [size, lh, ls] = scale[v];
  return {
    fontFamily: FONT[w],
    fontWeight: WEIGHT[w],
    fontSize: size,
    lineHeight: Math.round((size * lh) / 100),
    letterSpacing: +(size * ls).toFixed(2),
  };
}
