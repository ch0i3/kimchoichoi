// 채널(= 템플스테이 일과) 설정 — Figma "보이드 해커톤" 디자인 토큰 반영.
// 4채널, 잠긴 방 없음. 색은 Figma에서 추출한 값.
import chamseonCairn from './illustrations/chamseon_cairn.svg';
import dadamCup from './illustrations/dadam_cup.svg';
import dadamCupMask from './illustrations/dadam_cup_mask.svg';       // 찻잔 물 채우기 클립 마스크
import pohaengChime from './illustrations/pohaeng_chime.svg';
import pohaengChimeInline from './illustrations/pohaeng_chime.svg?raw'; // 풍경 흔들림용 인라인 SVG
import beonnoeJar from './illustrations/beonnoe_jar.svg';
// 사이드바용 플랫 아이콘(필터·foreignObject 제거 → 작게 렌더해도 안 깨짐)
import chamseonIcon from './illustrations/chamseon_cairn_icon.svg';
import dadamIcon from './illustrations/dadam_cup_icon.svg';
import pohaengIcon from './illustrations/pohaeng_chime_icon.svg';
import beonnoeIcon from './illustrations/beonnoe_jar_icon.svg';
// 배경 도형(일러스트 뒤 은은한 풍경) — Figma "배경" 섹션(107:1861)
import chamseonBg from './backgrounds/chamseon_bg.svg';
import dadamBg from './backgrounds/dadam_bg.svg';
import pohaengBgR1 from './backgrounds/pohaeng_bg_r1.svg';
import pohaengBgL1 from './backgrounds/pohaeng_bg_l1.svg';
import pohaengBgR2 from './backgrounds/pohaeng_bg_r2.svg';
import beonnoeBg from './backgrounds/beonnoe_bg.svg';

export const CHANNELS = [
  {
    slug: 'chamseon', name: '참선',
    sub: '차분히 앉아 쌓이는 돌에 집중해보세요',
    sidebarSub: '조용히 앉아 나에게 집중하는 시간',
    bg: '#CEDDBE', ink: '#4A5A38', accent: '#97B17C',
    kind: 'cairn',              // 돌탑 — 페이지는 Canvas 애니메이션
    illo: chamseonCairn, icon: chamseonIcon, // 사이드바 미니 아이콘(플랫)
    bgLayers: [{ src: chamseonBg, x: -31, y: 546, w: 451 }], // 녹색 언덕
  },
  {
    slug: 'pohaeng', name: '포행',
    sub: '천천히 걸으며 주변을 바라보는 시간',
    sidebarSub: '천천히 걸으며 주변을 바라보는 시간',
    bg: '#BEDDD3', ink: '#1D5B47', accent: '#69B099',
    kind: 'img', illo: pohaengChime, icon: pohaengIcon, illoRatio: 197 / 350,
    illoInline: pohaengChimeInline, pedometer: true, // 만보기 걸음마다 풍경이 흔들림
    bgLayers: [
      { src: pohaengBgR2, x: 274, y: 32, w: 120 },
      { src: pohaengBgR1, x: 295, y: 125, w: 144 },
      { src: pohaengBgL1, x: -37, y: 221, w: 144 },
    ], // 대나무(양옆 세로 줄기)
  },
  {
    slug: 'dadam', name: '다담',
    sub: '차분한 대화와 함께하는 시간',
    sidebarSub: '차분한 대화와 함께하는 시간',
    bg: '#BFDDBE', ink: '#244D23', accent: '#7DB67B',
    kind: 'img', illo: dadamCup, icon: dadamIcon, illoRatio: 302 / 197,
    chat: true, illoMask: dadamCupMask, // 채팅 한마디마다 찻물이 참
    bgLayers: [{ src: dadamBg, x: -1121, y: 553, w: 2618 }], // 지면 띠(풀블리드)
  },
  {
    slug: 'beonnoe', name: '번뇌',
    sub: '108번의 탭으로 마음을 가볍게 비워보세요',
    sidebarSub: '복잡한 마음을 내려놓는 시간',
    bg: '#BED5DD', ink: '#365F6D', accent: '#71A5B7',
    kind: 'jar', illo: beonnoeJar, icon: beonnoeIcon, illoRatio: 299 / 343, // 달항아리 108탭
    bgLayers: [{ src: beonnoeBg, x: -309, y: 517, w: 1004 }], // 바닥/지평선 플레인
  },
];

export const DEFAULT_CHANNEL = 'chamseon';
export const ENTRY_JAR = beonnoeJar; // 입장 화면 달항아리(비움)

export const getChannel = (slug) => CHANNELS.find((c) => c.slug === slug);
export const channelIndex = (slug) => CHANNELS.findIndex((c) => c.slug === slug);
