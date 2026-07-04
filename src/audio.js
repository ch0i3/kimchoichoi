// 채널 앰비언트 음악 + 방 전환 크로스페이드.
//  - 참선/포행/다담 = 루프 앰비언트 (방 바꾸면 800ms 크로스페이드)
//  - 번뇌 108배 = 탭마다 목탁 원샷 (겹쳐 울림)
//  - 자동재생 정책: 최초 재생은 반드시 사용자 제스처(입장 클릭) 안에서 호출.
//
// 음원은 public/sounds/ 에 넣으면 /sounds/파일명 으로 서빙됨.

const FILES = {
  chamseon: '/sounds/chamseon.mp3',
  pohaeng: '/sounds/pohaeng.mp3',
  beonnoe: '/sounds/beonnoe.wav', // 번뇌: 잔잔한 배경음악 루프
};
const WATER = '/sounds/dadam.mp3'; // 다담: 채팅 물소리 (원샷, 루프 아님)

let current = null;      // { slug, el }
let muted = false;
const baseVol = 0.45;    // 조용히 머무는 앱 — 기본 볼륨 낮게

function fade(el, to, ms, done) {
  const from = el.volume;
  const start = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - start) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    k < 1 ? requestAnimationFrame(step) : done && done();
  })(performance.now());
}

/** 채널 앰비언트 재생. 방 바꾸면 이전 곡 페이드아웃 + 새 곡 페이드인. */
export function playChannel(slug) {
  if (current && current.slug === slug) return;
  if (current) { current.el.pause(); current = null; } // 이전 채널 음악 즉시 끊김
  const url = FILES[slug];
  if (!url) return; // 앰비언트 없는 방(다담) → 무음
  const el = new Audio(url);
  el.loop = true;
  el.volume = 0;
  el.play().catch(() => {}); // 사용자 제스처 이후여야 재생됨
  current = { slug, el };
  if (!muted) fade(el, baseVol, 500); // 새 채널만 잔잔히 페이드인
}

/** 다담 채팅 물소리 (원샷). 채팅 한마디마다 한 번. */
export function playWater() {
  if (muted) return;
  const a = new Audio(WATER);
  a.volume = baseVol;
  a.play().catch(() => {});
}

export function isMuted() { return muted; }

export function setMuted(v) {
  muted = v;
  if (current) current.el.volume = v ? 0 : baseVol;
}

export function stopAll() {
  if (current) { current.el.pause(); current = null; }
}
