// 첫 실행 인트로(4장)를 봤는지. 기기·브라우저마다 한 번만 보여 준다.
import { store } from './api';

const KEY = 'dibs.introSeen';
export const introSeen = async () => (await store.get(KEY)) === '1';
export const markIntroSeen = () => store.set(KEY, '1');
