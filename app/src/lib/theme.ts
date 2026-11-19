// 프로토타입 '팔레트 · 메탈릭 핑크' 기준: 메인은 메탈릭 핑크 하나, 나머지는 미드나잇 계열
export const colors = {
  deepest: '#131918', // 가장 깊은 바탕
  bg: '#1A1B29', // 앱 화면 바탕
  card: '#2A3654', // 표지·카드 톤
  cardAlt: '#584C56', // 보조 표지 톤
  accent: '#E09AAB', // 강조 숫자·진행 바
  button: '#EAB0C2', // 버튼
  glow: '#E3A5CC',
  text: '#F3E8EE', // 본문 글자
  muted: '#B3A9BA',
  faint: '#8F879C',
  line: 'rgba(243,232,238,0.12)',
  up: '#F0776C', // 상승 (국내 관례: 빨강)
  down: '#8FB3F0', // 하락 (파랑)
  danger: '#FF8A80',
  ok: '#9ED9B5',
};

export const space = (n: number) => n * 4;
export const radius = 14;
