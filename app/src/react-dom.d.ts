// react-dom 은 웹 빌드에 이미 들어 있지만 타입 패키지는 따로 두지 않았다. 웹 팝업(Overlay.web.tsx)이 쓰는 createPortal 만 선언한다.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
