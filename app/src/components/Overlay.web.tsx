import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';

// 웹 전용 팝업 층.
// React Native 의 Modal 은 웹에서 문서 맨 끝(body)에 붙어서, 넓은 창의 휴대폰 틀 밖 브라우저 화면 전체에 떠 버린다.
// 그래서 휴대폰 틀 요소 안으로 포털을 열어 그 위를 덮는다:
//   PhoneFrame 의 틀(#phone-root) → 시연 빌드의 CSS 틀(#root) → 없으면 화면 전체.
// 포털이라 React 컨텍스트(세션·안전 영역 등)는 그대로 이어진다.
function host(): { el: HTMLElement; fixed: boolean } | null {
  if (typeof document === 'undefined') return null;
  const frame = document.getElementById('phone-root') ?? document.getElementById('root');
  return frame ? { el: frame, fixed: false } : { el: document.body, fixed: true };
}

export function Overlay({ visible, onRequestClose, children }: {
  visible: boolean; onRequestClose?: () => void; animationType?: 'fade' | 'slide' | 'none'; children: ReactNode;
}) {
  // Esc 로 닫기 (Modal 의 뒤로 가기와 같은 역할)
  useEffect(() => {
    if (!visible || !onRequestClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onRequestClose]);
  const h = visible ? host() : null;
  if (!h) return null;
  return createPortal(
    <View style={{ position: (h.fixed ? 'fixed' : 'absolute') as never, top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>{children}</View>,
    h.el,
  );
}
