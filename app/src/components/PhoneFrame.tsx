import type { ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';

// 웹에서 창이 넓으면 앱을 휴대폰 크기 틀(390 × 844)에 담아 가운데에 보여 준다.
// 화면설계도가 390px 기준이라, 넓은 창에서 표지·카드가 늘어나 비율이 깨지는 것을 막는다.
export const FRAME_W = 390;
const FRAME_H = 844;

export function isFramed(w: number) {
  return Platform.OS === 'web' && w > 520;
}

/** 앱 화면 너비 (틀 안이면 틀 너비) */
export function useScreenWidth() {
  const { width } = useWindowDimensions();
  return isFramed(width) ? FRAME_W : width;
}

// 시연 빌드(artifact_postprocess.py)는 index.html 의 CSS 로 이미 #root 를 휴대폰 틀(상태바 44px 포함)로 만든다.
// 그 안에서 또 844px 틀을 그리면 남는 높이(800px)보다 커서 위아래가 22px씩 잘린다 → 그때는 틀을 그리지 않는다.
const cssFramed = () => typeof document !== 'undefined' && !!document.getElementById('phone-frame');

export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  if (!isFramed(width) || cssFramed()) return <>{children}</>;
  const h = Math.min(FRAME_H, height - 32);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9EBEF' }}>
      <View nativeID="phone-root" style={{ width: FRAME_W, height: h, borderRadius: 28, overflow: 'hidden', backgroundColor: '#FFFFFF',
        shadowColor: '#191F28', shadowOpacity: 0.18, shadowRadius: 40, shadowOffset: { width: 0, height: 16 },
        // 틀 안에서 position: fixed·absolute 요소(하단 탭 등)가 틀을 기준으로 놓이게 한다. 팝업(Overlay)은 #phone-root 안으로 포털
        transform: [{ translateZ: 0 }] as never }}>
        {children}
      </View>
    </View>
  );
}
