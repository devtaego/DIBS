// 웹: public/ 의 데모 미디어를 불러온다 (번들하지 않음). iOS·Android 는 media.native.ts 가 쓰인다.
// 상대 경로(covers/x.jpg)는 <base> 가 있으면(아티팩트 배포) 그 기준, 없으면(개발 서버·일반 배포) 사이트 루트 기준으로 연다.
// 루트 기준이 아니면 /work/7 같은 하위 화면에서 /work/covers/x.jpg 를 찾게 된다.
import type { ImageSourcePropType } from 'react-native';

function resolve(path: string) {
  if (/^(https?:|data:|blob:|\/)/.test(path)) return path;
  const hasBase = typeof document !== 'undefined' && !!document.querySelector('base[href]');
  return hasBase ? path : `/${path}`;
}

export function imageSource(path?: string | null): ImageSourcePropType | undefined {
  return path ? { uri: resolve(path) } : undefined;
}

/** 영상 소스. 시연용 가짜 CDN 주소면 null */
export function videoSource(path?: string | null): string | null {
  return path && !/^https?:\/\/cdn\.example\//.test(path) ? resolve(path) : null;
}
