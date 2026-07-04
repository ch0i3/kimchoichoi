// 채널(= 템플스테이 일과) 설정 — Figma "보이드 해커톤" 디자인 토큰 반영.
// 4채널, 잠긴 방 없음. 색은 Figma에서 추출한 값.
import dadamCup from './illustrations/dadam_cup.svg';
import dadamCupMask from './illustrations/dadam_cup_mask.svg';
import pohaengChime from './illustrations/pohaeng_chime.svg';
import pohaengChimeInline from './illustrations/pohaeng_chime.svg?raw';
import beonnoeJar from './illustrations/beonnoe_jar.svg';

export const CHANNELS = [
  {
    slug: 'chamseon', name: '참선',
    sub: '차분히 앉아 쌓이는 돌에 집중해보세요',
    sidebarSub: '조용히 앉아 나에게 집중하는 시간',
    bg: '#CEDDBE', ink: '#4A5A38', accent: '#97B17C',
    kind: 'cairn',              // 돌탑 — Canvas 애니메이션
  },
  {
    slug: 'pohaeng', name: '포행',
    sub: '천천히 걸으며 주변을 바라보는 시간',
    sidebarSub: '천천히 걸으며 주변을 바라보는 시간',
    bg: '#BEDDD3', ink: '#1D5B47', accent: '#69B099',
    kind: 'img', illo: pohaengChime, illoRatio: 197 / 350,
    illoInline: pohaengChimeInline, pedometer: true,
  },
  {
    slug: 'dadam', name: '다담',
    sub: '차분한 대화와 함께하는 시간',
    sidebarSub: '차분한 대화와 함께하는 시간',
    bg: '#BFDDBE', ink: '#244D23', accent: '#7DB67B',
    kind: 'img', illo: dadamCup, illoRatio: 302 / 197,
    chat: true, illoMask: dadamCupMask,
  },
  {
    slug: 'beonnoe', name: '번뇌',
    sub: '108번의 탭으로 마음을 가볍게 비워보세요',
    sidebarSub: '복잡한 마음을 내려놓는 시간',
    bg: '#BED5DD', ink: '#365F6D', accent: '#71A5B7',
    kind: 'jar', illo: beonnoeJar, illoRatio: 299 / 343, // 달항아리 108탭
  },
];

export const DEFAULT_CHANNEL = 'chamseon';
export const ENTRY_JAR = beonnoeJar; // 입장 화면 달항아리(비움)

export const getChannel = (slug) => CHANNELS.find((c) => c.slug === slug);
export const channelIndex = (slug) => CHANNELS.findIndex((c) => c.slug === slug);
