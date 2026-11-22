import type { ReactNode } from 'react';
import { Modal } from 'react-native';

// 팝업(바텀시트·로딩)을 띄우는 층. 앱(iOS·안드로이드)은 Modal 그대로. 웹은 Overlay.web.tsx (휴대폰 틀 안에 띄움).
export function Overlay({ visible, onRequestClose, animationType = 'fade', children }: {
  visible: boolean; onRequestClose?: () => void; animationType?: 'fade' | 'slide' | 'none'; children: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType={animationType} statusBarTranslucent onRequestClose={onRequestClose}>{children}</Modal>;
}
