// DIBS Design System v1.0 (design/최종.html) 토큰을 앱으로 옮긴 것.
// 규칙: 화면에서는 atomic 값을 직접 쓰지 않고 semantic(colors.*)만 쓴다.
// 최종 시안이 라이트(dds-light)라서 기본은 라이트. 다크로 바꾸려면 MODE만 'dark'로.

export const MODE: 'light' | 'dark' = 'light';

const atomic = {
  white: '#FFFFFF',
  black: '#000000',
  neutral5: '#12131D',
  neutral10: '#1A1B29',
  neutral15: '#232438',
  neutral17: '#24253A',
  neutral20: '#2B2C44',
  neutral22: '#2E2F48',
  neutral30: '#3A3B57',
  neutral35: '#4B4B66',
  neutral50: '#7D768A',
  neutral55: '#938BA0',
  neutral60: '#9A92A7',
  neutral70: '#B3A9BA',
  neutral80: '#CFC4D0',
  neutral99: '#F3E8EE',
  pink10: '#2A1620',
  pink15: '#9C3F66',
  pink25: '#C4426F',
  pink30: '#C97C99',
  pink35: '#DE5786',
  pink38: '#D9588A',
  pink40: '#D58AA6',
  pink42: '#EF6F9A',
  pink45: '#E09AAB',
  pink50: '#EAB0C2',
  pink60: '#EDB3C6',
  pink70: '#F3C7D6',
  gray10: '#191F28',
  gray30: '#333D4B',
  gray40: '#4E5968',
  gray50: '#6B7684',
  gray60: '#8B95A1',
  gray80: '#C9CED5',
  gray90: '#E2E5E9',
  gray95: '#EEF0F3',
  gray97: '#F4F5F7',
  violet40: '#7C5CD6',
  violet50: '#C9A7E8',
  red40: '#F04452',
  red50: '#F0776C',
  blue40: '#3182F6',
  blue50: '#7BA7E6',
  green40: '#12B76A',
  green50: '#6FCF9B',
  yellow40: '#D98A00',
  yellow50: '#F2C96B',
};

const light = {
  primary: atomic.pink35,
  primaryStrong: atomic.pink25,
  onPrimary: atomic.white,
  labelStrong: atomic.gray10,
  labelNormal: atomic.gray30,
  labelNeutral: atomic.gray40,
  labelAlternative: atomic.gray50,
  labelAssistive: atomic.gray60,
  labelDisable: atomic.gray80,
  bgNormal: atomic.white,
  bgAlternative: atomic.gray97,
  elevatedNormal: atomic.white,
  elevatedAlternative: atomic.gray97,
  elevatedStrong: atomic.gray95,
  elevatedHeavy: atomic.gray90,
  line: 'rgba(0,0,0,0.08)',
  lineStrong: 'rgba(0,0,0,0.12)',
  fillNormal: 'rgba(0,0,0,0.08)',
  positive: atomic.green40,
  cautionary: atomic.yellow40,
  negative: atomic.red40,
  rise: atomic.red40,
  fall: atomic.blue40,
  riseFill: 'rgba(240,68,82,0.12)',
  fallFill: 'rgba(49,130,246,0.12)',
  webtoon: atomic.violet40,
  highlight: atomic.pink25,
  highlightFill: 'rgba(222,87,134,0.12)',
  progress: atomic.pink35,
  dimmer: 'rgba(0,0,0,0.52)',
  navBg: 'rgba(255,255,255,0.94)',
  shortsBtn: atomic.pink70,
  onShortsBtn: atomic.pink10,
};

const dark: typeof light = {
  primary: atomic.pink42,
  primaryStrong: atomic.pink38,
  onPrimary: atomic.pink10,
  labelStrong: atomic.neutral99,
  labelNormal: atomic.neutral80,
  labelNeutral: atomic.neutral70,
  labelAlternative: atomic.neutral60,
  labelAssistive: atomic.neutral55,
  labelDisable: atomic.neutral35,
  bgNormal: atomic.neutral10,
  bgAlternative: atomic.neutral5,
  elevatedNormal: atomic.neutral17,
  elevatedAlternative: atomic.neutral15,
  elevatedStrong: atomic.neutral22,
  elevatedHeavy: atomic.neutral30,
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.12)',
  fillNormal: 'rgba(255,255,255,0.08)',
  positive: atomic.green50,
  cautionary: atomic.yellow50,
  negative: atomic.red50,
  rise: atomic.red50,
  fall: atomic.blue50,
  riseFill: 'rgba(240,119,108,0.16)',
  fallFill: 'rgba(123,167,230,0.16)',
  webtoon: atomic.violet50,
  highlight: atomic.pink60,
  highlightFill: 'rgba(224,154,171,0.16)',
  progress: atomic.pink50,
  dimmer: 'rgba(18,19,29,0.52)',
  navBg: 'rgba(36,37,58,0.94)',
  shortsBtn: atomic.pink70,
  onShortsBtn: atomic.pink10,
};

const sem = MODE === 'light' ? light : dark;

// 기존 화면 코드가 쓰던 이름(bg, card, text, up/down …)은 그대로 두고 semantic 토큰에 연결한다.
export const colors = {
  ...sem,
  bg: sem.bgNormal, // 화면 바탕
  deepest: sem.bgAlternative, // 입력창·세그먼트 바탕
  surface: sem.elevatedNormal, // 세그먼트 선택 칸
  card: sem.elevatedAlternative, // 카드
  cardAlt: sem.elevatedStrong, // 강조 카드·표지 자리
  accent: sem.primary, // 강조 숫자·진행 바
  button: sem.primary,
  glow: sem.highlight,
  text: sem.labelStrong,
  body: sem.labelNormal,
  muted: sem.labelAlternative,
  faint: sem.labelAssistive,
  up: sem.rise, // 상승·매수 (국내 관례: 빨강)
  down: sem.fall, // 하락·매도 (파랑)
  danger: sem.negative,
  ok: sem.positive,
};

export const space = (n: number) => n * 4;
export const screenPadding = 24;

export const radii = { tag: 4, thumb: 8, control: 12, card: 16, sheet: 20, chip: 999 };
export const radius = radii.control;

// 타이포 스케일 (ts-*): 크기 / 줄간격 비율 / 자간(em)
export const type = {
  title3: { fontSize: 24, lineHeight: 33, letterSpacing: -0.6 },
  heading1: { fontSize: 22, lineHeight: 30, letterSpacing: -0.48 },
  heading2: { fontSize: 20, lineHeight: 28, letterSpacing: -0.4 },
  headline1: { fontSize: 18, lineHeight: 25, letterSpacing: -0.32 },
  body1: { fontSize: 16, lineHeight: 24, letterSpacing: -0.19 },
  body2: { fontSize: 15, lineHeight: 22, letterSpacing: -0.15 },
  label1: { fontSize: 14, lineHeight: 20, letterSpacing: -0.08 },
  label2: { fontSize: 13, lineHeight: 19, letterSpacing: -0.05 },
  caption1: { fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 16, letterSpacing: 0 },
} as const;

// 표지 이미지가 아직 없을 때 쓰는 자리 색 (작품 id로 고정)
const COVER_TONES = ['#F3C7D6', '#E3D7F5', '#D6E4F7', '#F7E3EC', '#E2E5E9', '#EDB3C6'];
export const coverTone = (id: number) => COVER_TONES[id % COVER_TONES.length];
