// 시연 기준 시각. 조각투자 개정 시행(2027년 2월) 이후로 맞춰 시연한다.
// 서버는 DIBS_NOW, 앱은 EXPO_PUBLIC_NOW 로 같은 시각을 준다. 정적 데모는 기본값을 쓴다.
import { DEMO } from './demo';

export const DEMO_NOW = '2027-03-02T09:00:00+09:00';
const fixed = process.env.EXPO_PUBLIC_NOW || (DEMO ? DEMO_NOW : '');
const t0 = Date.now();
/** 지금(ms). 고정 시각이 있으면 그 시각부터 흐른다. */
export const nowMs = () => (fixed ? Date.parse(fixed) + (Date.now() - t0) : Date.now());
