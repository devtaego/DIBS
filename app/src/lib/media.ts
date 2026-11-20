// 웹: public/ 의 데모 미디어를 문서 기준 상대 주소로 불러온다 (번들하지 않음).
// iOS·Android 는 media.native.ts 가 쓰인다.
import type { ImageSourcePropType } from 'react-native';

export function imageSource(path?: string | null): ImageSourcePropType | undefined {
  return path ? { uri: path } : undefined;
}

/** 영상 소스. 시연용 가짜 CDN 주소면 null */
export function videoSource(path?: string | null): string | null {
  return path && !/^https?:\/\/cdn\.example\//.test(path) ? path : null;
}
