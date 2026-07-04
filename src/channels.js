// 채널(= 템플스테이 일과) 정적 설정. 프론트 하드코딩 — DB 테이블 없음.
// accent: 무드 색, minutes: 권장 머무름(안내용), locked: 곧 열림(비활성).

export const CHANNELS = [
  { slug: 'chamseon', name: '참선',   hanja: '參禪',     accent: '#7B8840', minutes: 15, locked: false, desc: '고요히 앉아 머문다' },
  { slug: 'pohaeng',  name: '포행',   hanja: '布行',     accent: '#AC563A', minutes: 20, locked: false, desc: '천천히 거닐며 머문다' },
  { slug: 'dadam',    name: '다담',   hanja: '茶談',     accent: '#E3B056', minutes: 10, locked: false, desc: '차 한 잔의 온기로 머문다' },
  { slug: 'baru',     name: '발우공양', hanja: '鉢盂供養', accent: '#8A8A8A', locked: true },
  { slug: 'ullyeok',  name: '울력',   hanja: '鬱力',     accent: '#8A8A8A', locked: true },
  { slug: 'mugeon',   name: '묵언',   hanja: '默言',     accent: '#8A8A8A', locked: true },
];

export const DEFAULT_CHANNEL = 'chamseon';

/** slug → 채널 설정 조회 */
export function getChannel(slug) {
  return CHANNELS.find((c) => c.slug === slug);
}
