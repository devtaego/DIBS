// 프로필 사진: 디비 얼굴 9종 중에서 고른다. 서버에는 avatar_url = 'dibby:face-happy' 처럼 저장.
import type { ImageSourcePropType } from 'react-native';

export const AVATARS: Record<string, ImageSourcePropType> = {
  'face-happy': require('../../assets/dibby/face-happy.png'),
  'face-star': require('../../assets/dibby/face-star.png'),
  'face-wink': require('../../assets/dibby/face-wink.png'),
  'face-bliss': require('../../assets/dibby/face-bliss.png'),
  'face-wow': require('../../assets/dibby/face-wow.png'),
  'face-calm': require('../../assets/dibby/face-calm.png'),
  'face-sleepy': require('../../assets/dibby/face-sleepy.png'),
  'face-worry': require('../../assets/dibby/face-worry.png'),
};
export const AVATAR_KEYS = Object.keys(AVATARS);
export const avatarKey = (url?: string | null) => (url?.startsWith('dibby:') && url.slice(6) in AVATARS ? url.slice(6) : 'face-happy');
export const avatarSource = (url?: string | null) => AVATARS[avatarKey(url)];
