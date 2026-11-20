// 자동 생성: python3 scripts/gen_media_map.py (직접 고치지 말 것)
// iOS·Android 에서는 public/ 의 데모 미디어를 앱에 번들한다. 웹은 media.ts 가 주소로 불러온다.
import type { ImageSourcePropType } from 'react-native';

const BUNDLED: Record<string, number> = {
  'covers/abp.jpg': require('../../public/covers/abp.jpg'),
  'covers/akn.jpg': require('../../public/covers/akn.jpg'),
  'covers/apl.jpg': require('../../public/covers/apl.jpg'),
  'covers/cgm.jpg': require('../../public/covers/cgm.jpg'),
  'covers/cpb.jpg': require('../../public/covers/cpb.jpg'),
  'covers/cwd.jpg': require('../../public/covers/cwd.jpg'),
  'covers/dmg.jpg': require('../../public/covers/dmg.jpg'),
  'covers/dsg.jpg': require('../../public/covers/dsg.jpg'),
  'covers/ets.jpg': require('../../public/covers/ets.jpg'),
  'covers/ghb.jpg': require('../../public/covers/ghb.jpg'),
  'covers/gjs.jpg': require('../../public/covers/gjs.jpg'),
  'covers/gnl.jpg': require('../../public/covers/gnl.jpg'),
  'covers/gyb.jpg': require('../../public/covers/gyb.jpg'),
  'covers/hgd.jpg': require('../../public/covers/hgd.jpg'),
  'covers/htj.jpg': require('../../public/covers/htj.jpg'),
  'covers/hwa.jpg': require('../../public/covers/hwa.jpg'),
  'covers/iai.jpg': require('../../public/covers/iai.jpg'),
  'covers/ihs.jpg': require('../../public/covers/ihs.jpg'),
  'covers/isg.jpg': require('../../public/covers/isg.jpg'),
  'covers/jby.jpg': require('../../public/covers/jby.jpg'),
  'covers/jdm.jpg': require('../../public/covers/jdm.jpg'),
  'covers/jgj.jpg': require('../../public/covers/jgj.jpg'),
  'covers/jmd.jpg': require('../../public/covers/jmd.jpg'),
  'covers/jnb.jpg': require('../../public/covers/jnb.jpg'),
  'covers/nba.jpg': require('../../public/covers/nba.jpg'),
  'covers/nbh.jpg': require('../../public/covers/nbh.jpg'),
  'covers/nbr.jpg': require('../../public/covers/nbr.jpg'),
  'covers/nbs.jpg': require('../../public/covers/nbs.jpg'),
  'covers/nch.jpg': require('../../public/covers/nch.jpg'),
  'covers/njk.jpg': require('../../public/covers/njk.jpg'),
  'covers/njr.jpg': require('../../public/covers/njr.jpg'),
  'covers/njs.jpg': require('../../public/covers/njs.jpg'),
  'covers/nsd.jpg': require('../../public/covers/nsd.jpg'),
  'covers/ond.jpg': require('../../public/covers/ond.jpg'),
  'covers/pmb.jpg': require('../../public/covers/pmb.jpg'),
  'covers/pmd.jpg': require('../../public/covers/pmd.jpg'),
  'covers/pwh.jpg': require('../../public/covers/pwh.jpg'),
  'covers/sgl.jpg': require('../../public/covers/sgl.jpg'),
  'covers/syp.jpg': require('../../public/covers/syp.jpg'),
  'covers/ush.jpg': require('../../public/covers/ush.jpg'),
  'covers/whg.jpg': require('../../public/covers/whg.jpg'),
  'covers/wrb.jpg': require('../../public/covers/wrb.jpg'),
  'episodes/akn-1.jpg': require('../../public/episodes/akn-1.jpg'),
  'episodes/cwd-1.jpg': require('../../public/episodes/cwd-1.jpg'),
  'episodes/sgl-1.jpg': require('../../public/episodes/sgl-1.jpg'),
  'shorts/akn.mp4': require('../../public/shorts/akn.mp4'),
  'shorts/cwd.mp4': require('../../public/shorts/cwd.mp4'),
  'shorts/nch.mp4': require('../../public/shorts/nch.mp4'),
  'shorts/pmb.mp4': require('../../public/shorts/pmb.mp4'),
  'shorts/sgl.mp4': require('../../public/shorts/sgl.mp4'),
};

/** 이미지 소스. 번들된 데모 파일이면 require 자산, http(s) 주소면 그대로, 그 밖에는 없음 */
export function imageSource(path?: string | null): ImageSourcePropType | undefined {
  if (!path) return undefined;
  if (BUNDLED[path] != null) return BUNDLED[path];
  return /^https?:\/\//.test(path) ? { uri: path } : undefined;
}

/** 영상 소스 (expo-video). 재생할 수 없으면 null */
export function videoSource(path?: string | null): number | string | null {
  if (!path) return null;
  if (BUNDLED[path] != null) return BUNDLED[path];
  return /^https?:\/\//.test(path) && !/cdn\.example\//.test(path) ? path : null;
}
