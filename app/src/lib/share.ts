// 작품별 공유 링크. 앱에서는 dibs://work/{id} (Expo Go에서는 exp:// 주소), 웹에서는 현재 주소 기준 링크.
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

export function workLink(workId: number) {
  return Linking.createURL(`/work/${workId}`);
}

/** 공유 시트를 열고, 웹에서 막히면 링크를 클립보드에 복사한다. 결과 문구를 돌려준다 */
export async function shareWork(workId: number, title: string): Promise<string> {
  const url = workLink(workId);
  const message = `「${title}」 지금 DIBS에서 먼저 찜하기\n${url}`;
  if (Platform.OS !== 'web') {
    await Share.share({ message, url, title });
    return '';
  }
  try {
    const nav = globalThis.navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav?.share) {
      await nav.share({ title, text: message, url });
      return '';
    }
  } catch {
    /* 공유 시트가 막힌 환경 → 복사로 */
  }
  try {
    await globalThis.navigator?.clipboard?.writeText(message);
    return '작품 링크를 복사했어요';
  } catch {
    return `링크: ${url}`;
  }
}
