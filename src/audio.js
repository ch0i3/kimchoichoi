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
let fadeToken = 0;       // 진행 중 페이드 취소용
const baseVol = 0.45;    // 조용히 머무는 앱 — 기본 볼륨 낮게

function fade(el, to, ms, done) {
  const token = ++fadeToken;
  const from = el.volume;
  const start = performance.now();
  (function step(t) {
    if (token !== fadeToken) return; // 새 페이드/음소거로 취소됨
    const k = Math.min(1, (t - start) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else if (done) done();
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
  el.muted = muted;
  el.volume = 0;
  current = { slug, el };
  if (!muted) { // 음소거 중이면 재생 자체를 안 함 (해제 시 재생)
    el.play().catch(() => {});
    fade(el, baseVol, 500); // 잔잔히 페이드인 (iOS는 volume 무시하지만 재생은 됨)
  }
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
  fadeToken++; // 진행 중 페이드 취소
  if (!current) return;
  current.el.muted = v;
  if (v) {
    current.el.pause();                 // iOS는 volume 무시 → 아예 멈춰서 확실히 음소거
  } else {
    current.el.volume = baseVol;
    current.el.play().catch(() => {});  // 해제 시 다시 재생 (버튼 클릭=제스처라 허용됨)
  }
}

export function stopAll() {
  if (current) { current.el.pause(); current = null; }
}
