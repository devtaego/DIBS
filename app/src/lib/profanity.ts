// 댓글 욕설·비속어 필터 (시연용 기본 목록).
// 띄어쓰기·특수문자·숫자를 끼워 넣어 피하는 경우(시1발, 시 발, ㅅ.ㅂ)도 잡도록 글자만 남겨 비교한다.
const WORDS = [
  '시발', '씨발', '씨빨', '씨팔', '시팔', '쉬발', '슈발', 'ㅅㅂ', 'ㅆㅂ', 'ㅅㅃ', '썅', '쌍놈', '쌍년',
  '병신', '븅신', '빙신', 'ㅂㅅ', '개새끼', '개새', '개색', '개세끼', '새끼', 'ㅅㄲ', '좆', '존나', '졸라', 'ㅈㄴ',
  '지랄', 'ㅈㄹ', '미친놈', '미친년', '미친새', '닥쳐', '꺼져', '엠창', '느금', '니애미', '느개비', '애미', '애비',
  'fuck', 'fck', 'shit', 'bitch', 'asshole',
];

const strip = (s: string) => s.toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '').replace(/[0-9]/g, '');

/** 욕설이 들어 있는지 */
export function hasProfanity(text: string): boolean {
  const t = strip(text);
  return WORDS.some((w) => t.includes(w));
}

/** 화면 표시용: 욕설 낱말을 ●로 가린다 (띄어쓰기 그대로 둔 단순 치환) */
export function maskProfanity(text: string): string {
  let out = text;
  for (const w of WORDS) {
    const re = new RegExp(w.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\W\\d_]*'), 'gi');
    out = out.replace(re, (m) => '●'.repeat(Math.min(m.replace(/\s/g, '').length, 4)));
  }
  return out;
}
