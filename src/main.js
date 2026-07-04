// 앱 진입: 입장 → 4채널 스와이프 → 채널별 realtime · 돌탑 · 사이드바 · 108탭.
import './style.css';
import { CHANNELS, DEFAULT_CHANNEL, ENTRY_JAR, getChannel, channelIndex } from './channels.js';
import {
  myId, joinRoom, switchRoom, leave, broadcastBeadDone, broadcastChat, fmtDuration,
} from './realtime.js';
import { createCairn } from './cairn.js';
import { createJar } from './jar.js';
import { createPedometer } from './pedometer.js';
import { playChannel, playWater, setMuted, stopAll } from './audio.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

let name = '';
let channel = null;
let currentSlug = '';
let activeIdx = 0;
let cairn = null;
let cairnCanvas = null;
let jar = null;
let jarCanvas = null;
// 다담 찻잔 물 채우기
let dadamWaterEl = null;
let waterPct = 0;
const WATER_STEP = 16; // 한마디당 채워지는 비율(%)
// 포행 만보기 · 풍경
let chimeEl = null;
let stepCount = 0;
const pedo = createPedometer(onStep);

// 다담 찻잔 물 — 찻잔 내부 모양(clipPath)에 물을 클립. 수면은 SMIL로 출렁이고,
// 물 그룹(.cw-level)을 위/아래로 옮겨 수위를 조절한다. CSS 마스크보다 모바일에서 확실.
const CUP_WATER_SVG = `
  <svg class="cup-water" viewBox="0 0 299 197" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <clipPath id="dadamCupClip"><path d="M54.2138 133.634C70.3843 150.264 87.7286 161.796 106.722 169.208L99.9665 197H130.468H170.731H201.233L194.477 169.208C213.47 161.796 226.639 157.131 242.809 140.5C258.461 124.403 267.502 96.1664 272.66 73.5128C277.56 51.9877 282.724 29.3039 297.657 8.88408C300.228 5.36783 297.915 1.83756e-05 293.637 1.79061e-05L170.731 0H130.468L3.07653 1.8174e-05C0.466756 1.85463e-05 -0.933019 3.14059 0.700608 5.17583C17.8442 26.534 23.3403 50.6756 28.5394 73.5128C33.6967 96.1664 38.5619 117.537 54.2138 133.634Z"/></clipPath>
      <linearGradient id="dadamWater" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9d67c"/><stop offset="0.55" stop-color="#93c968"/><stop offset="1" stop-color="#6fae4d"/>
      </linearGradient>
    </defs>
    <g clip-path="url(#dadamCupClip)">
      <g class="cw-level">
        <path fill="url(#dadamWater)">
          <animate attributeName="d" dur="2.6s" repeatCount="indefinite"
            values="M0,7 Q75,0 150,7 T299,7 L299,394 L0,394 Z;M0,7 Q75,14 150,7 T299,7 L299,394 L0,394 Z;M0,7 Q75,0 150,7 T299,7 L299,394 L0,394 Z" />
        </path>
      </g>
    </g>
  </svg>`;

// ── 입장 ──────────────────────────────────────────────────
$('enterJar').src = ENTRY_JAR;
$('enterBtn').onclick = () => enter($('nameInput').value.trim().slice(0, 12) || '무이');
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('enterBtn').click(); });

// 배경 박스(375×812)를 화면에 cover 하도록 균일 스케일 — 모든 배경 요소가 중앙 기준으로 함께 움직임
function updatePageScale() {
  const s = Math.max(window.innerWidth / 375, window.innerHeight / 812);
  document.documentElement.style.setProperty('--page-scale', s);
}
window.addEventListener('resize', updatePageScale);

function enter(nm) {
  name = nm;
  $('enter').classList.add('hidden');
  $('app').classList.remove('hidden');
  updatePageScale();
  buildPages();
  buildSidebar();
  buildIndicator();
  buildBeadCounter();
  buildChatBar();
  cairn = createCairn(cairnCanvas);
  jar = createJar(jarCanvas, { onTap: onBeadTap, onEmpty: onBeadEmpty });
  $('statusHead').addEventListener('click', toggleStatus);
  $('muteBtn').addEventListener('click', toggleMute);
  setActive(0);
}

// ── 페이지 생성 ───────────────────────────────────────────
function buildPages() {
  const pager = $('pager');
  pager.innerHTML = '';
  CHANNELS.forEach((c) => {
    const page = el('section', 'page');
    page.dataset.slug = c.slug;
    page.dataset.kind = c.kind;
    page.style.background = c.bg;
    page.style.setProperty('--page-ink', c.ink);

    const head = el('div', 'page-head');
    head.innerHTML = `<h1 class="page-title">${c.name}</h1><p class="page-sub">${c.sub}</p>`;
    if (c.pedometer) head.appendChild(buildPedoBar());
    page.appendChild(head);

    const illo = el('div', 'illo');
    if (c.kind === 'cairn') {
      cairnCanvas = document.createElement('canvas');
      illo.appendChild(cairnCanvas);
    } else if (c.kind === 'jar') {
      jarCanvas = document.createElement('canvas');
      illo.appendChild(jarCanvas);
    } else if (c.slug === 'dadam') {
      // 찻잔: 내부 모양에 클립된 물(SVG) + 위에 찻잔 이미지
      const wrap = el('div', 'cup-wrap');
      wrap.innerHTML = CUP_WATER_SVG;
      const img = document.createElement('img');
      img.src = c.illo; img.alt = '';
      wrap.appendChild(img);
      illo.appendChild(wrap);
      dadamWaterEl = wrap.querySelector('.cw-level');
      setWaterLevel(waterPct); // 초기 수위 반영
    } else if (c.slug === 'pohaeng' && c.illoInline) {
      // 풍경(風磬): 인라인 SVG를 걸음마다 흔든다. 데스크톱은 클릭=수동 걸음.
      const wrap = el('div', 'chime-wrap');
      wrap.innerHTML = c.illoInline;
      const svg = wrap.querySelector('svg');
      svg.classList.add('chime-svg');
      wrap.addEventListener('click', () => onStep());
      illo.appendChild(wrap);
      chimeEl = svg;
    } else {
      const img = document.createElement('img');
      img.src = c.illo; img.alt = '';
      illo.appendChild(img);
    }
    page.appendChild(illo);
    pager.appendChild(page);
  });

  pager.addEventListener('scroll', scheduleActive, { passive: true });
}

// ── 스와이프 → 활성 채널 감지 ─────────────────────────────
let scrollTimer = null;
function scheduleActive() {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const pager = $('pager');
    const i = Math.round(pager.scrollLeft / pager.clientWidth);
    if (i !== activeIdx) setActive(i);
  }, 140);
}

function setActive(i) {
  activeIdx = i;
  setStatus(false); // 채널 바뀌면 현황 닫기
  const c = CHANNELS[i];
  const root = document.documentElement.style;
  root.setProperty('--bg', c.bg);
  root.setProperty('--ink', c.ink);
  root.setProperty('--accent', c.accent);
  document.body.style.background = c.bg;

  updateIndicator(i);
  updateSidebarActive(c.slug);
  $('beadCounter').classList.toggle('hidden', c.slug !== 'beonnoe');
  $('chatBar').classList.toggle('hidden', !c.chat);      // 다담: 채팅바
  $('presence').classList.remove('hidden');              // 현황은 항상 보이게
  $('app').classList.toggle('chat-layout', !!c.chat);    // 다담: 현황을 채팅 위로 올림

  if (c.slug === 'chamseon') { cairn.reset(); cairn.start(); } else { cairn.stop(); }
  if (c.slug === 'beonnoe') jar.start(); else jar.stop();
  playChannel(c.slug); // 이전 채널 음악 즉시 끊고 새 채널 배경음악 재생 (다담은 무음)
  switchToRoom(c.slug);
}

// ── Realtime ──────────────────────────────────────────────
const handlers = {
  onSync: renderPresence,
  onBeadDone: ({ name: who }) => { ripple(`${who}님이 번뇌를 내려놓았습니다`); if (currentSlug === 'chamseon') cairn.addStone(); },
  onStone: ({ name: who }) => { ripple(`${who}님이 돌 하나를 얹었습니다`); if (currentSlug === 'chamseon') cairn.addStone(); },
  onChat: ({ name: who, text }) => { ripple(`${who}: ${text}`); if (currentSlug === 'dadam') fillWater(); },
};

async function switchToRoom(slug) {
  if (slug === currentSlug && channel) return;
  currentSlug = slug;
  renderPresence({ count: 0, people: [], totalMs: 0 }); // 전환 중 초기화
  channel = channel
    ? await switchRoom(channel, slug, name, handlers)
    : joinRoom(slug, name, handlers);
}

function renderPresence({ count, people }) {
  $('statusCount').textContent = count > 0 ? `지금 ${count}명이 함께 머물고 있어요` : '함께 머무는 중…';

  const list = $('rosterList');
  if (!people.length) {
    list.innerHTML = '<li class="empty">아직 혼자 머무는 중이에요</li>';
    return;
  }
  list.innerHTML = people.map((p) => {
    const me = p.id === myId;
    return `<li class="${me ? 'me' : ''}">` +
      `<span class="nm">${escapeHtml(p.name)}${me ? '<span class="tag">(나)</span>' : ''}</span>` +
      `<time>${fmtDuration(p.stayedMs)}</time></li>`;
  }).join('');
}

// 현황 바 열고 닫기 (하나의 바가 슬로우 스마트애니메이션으로 확장)
function setStatus(open) {
  $('statusBar').classList.toggle('open', open);
  $('statusBar').classList.toggle('closed', !open);
  $('statusHead').setAttribute('aria-expanded', String(open));
}
function toggleStatus() { setStatus(!$('statusBar').classList.contains('open')); }

// ── 페이지 인디케이터 ─────────────────────────────────────
function buildIndicator() {
  $('indicator').innerHTML = CHANNELS.map(() => '<span class="dot"></span>').join('');
}
function updateIndicator(i) {
  [...$('indicator').children].forEach((d, k) => d.classList.toggle('active', k === i));
}

// ── 사이드바 ──────────────────────────────────────────────
function buildSidebar() {
  $('channelList').innerHTML = CHANNELS.map((c) => `
    <li class="ch-row" data-slug="${c.slug}">
      <div class="txt">
        <div class="ch-name">${c.name}</div>
        <div class="ch-sub">${c.sidebarSub}</div>
      </div>
      <img class="ch-illo" src="${c.icon || c.illo || ''}" alt="" />
    </li>`).join('');
  $('channelList').addEventListener('click', (e) => {
    const row = e.target.closest('.ch-row');
    if (row) goToChannel(row.dataset.slug);
  });
  $('sidebarFooter').textContent = `${name} 님으로 머무는 중`;
  $('hamburger').onclick = openSidebar;
  $('sidebarClose').onclick = closeSidebar;
  $('scrim').onclick = closeSidebar;
}
function updateSidebarActive(slug) {
  [...$('channelList').children].forEach((r) => r.classList.toggle('active', r.dataset.slug === slug));
}
function openSidebar() { setStatus(false); $('sidebar').classList.add('open'); $('scrim').classList.add('show'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('scrim').classList.remove('show'); }

function goToChannel(slug) {
  const i = channelIndex(slug);
  if (i < 0) return;
  closeSidebar();
  $('pager').scrollTo({ left: i * $('pager').clientWidth, behavior: 'smooth' });
  // 스크롤 스냅이 곧 setActive 를 부르지만, 즉각 반응 위해 미리 갱신
  setTimeout(() => setActive(i), 320);
}

// ── 번뇌 108탭 ────────────────────────────────────────────
function buildBeadCounter() {
  const c = el('div'); c.id = 'beadCounter'; c.classList.add('hidden');
  c.innerHTML = `<div class="num">108</div><div class="sub">항아리를 두드려 번뇌를 비웁니다</div>`;
  $('app').appendChild(c);
}
// jar 가 탭을 처리하고 남은 횟수를 넘겨준다
function onBeadTap(count, remaining) {
  $('beadCounter').querySelector('.num').textContent = remaining;
}
function onBeadEmpty() {
  ripple('번뇌를 다 비웠습니다');
  if (channel) broadcastBeadDone(channel, name);
  setTimeout(() => {
    jar.reset();
    $('beadCounter').querySelector('.num').textContent = jar.config.tapsToEmpty;
  }, 1400);
}

// ── 다담 채팅 · 찻잔 물 채우기 ─────────────────────────────
function buildChatBar() {
  const bar = el('form');
  bar.id = 'chatBar';
  bar.classList.add('hidden');
  bar.innerHTML = `
    <input id="chatInput" type="text" maxlength="60" placeholder="차분히 한마디 건네보세요" autocomplete="off" />
    <button type="submit" id="chatSendBtn" aria-label="보내기">
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <path d="M2 9h13M9 3l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>`;
  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chatInput');
    const text = input.value.trim().slice(0, 60);
    if (!text) return;
    input.value = '';
    ripple(text);
    fillWater();
    playWater(); // 채팅 보낼 때 물소리 한 번
    if (channel) broadcastChat(channel, name, text);
  });
  $('app').appendChild(bar);
}

function fillWater() {
  waterPct = Math.min(100, waterPct + WATER_STEP);
  setWaterLevel(waterPct);
  if (waterPct >= 100) {
    setTimeout(() => {
      waterPct = 0;
      setWaterLevel(0);
      ripple('찻잔이 가득 차 비워냅니다');
    }, 900);
  }
}
function setWaterLevel(pct) {
  if (!dadamWaterEl) return;
  const p = Math.max(0, Math.min(100, pct));
  const y = 197 * (1 - p / 100); // 0%→197(비움, 물이 컵 아래로), 100%→0(가득)
  dadamWaterEl.style.transform = `translateY(${y}px)`;
}

// ── 포행 만보기 · 풍경(風磬) 흔들림 ─────────────────────────
function buildPedoBar() {
  const bar = el('div', 'pedo-bar');
  bar.innerHTML = `
    <button type="button" id="pedoBtn">만보기 연결</button>
    <p id="pedoCount" class="hidden"><strong>0</strong>걸음</p>`;
  bar.querySelector('#pedoBtn').addEventListener('click', connectPedometer);
  return bar;
}

async function connectPedometer() {
  const btn = $('pedoBtn');
  unlockChimeAudio(); // 사용자 제스처 → 오디오 컨텍스트 미리 풀어둔다
  if (!pedo.supported()) {
    btn.textContent = '이 기기에서는 지원되지 않아요';
    btn.disabled = true;
    return;
  }
  btn.textContent = '연결 중…';
  const ok = await pedo.start();
  if (ok) {
    btn.classList.add('hidden');
    $('pedoCount').classList.remove('hidden');
  } else {
    btn.textContent = '연결 실패 · 다시 시도';
  }
}

function onStep() {
  stepCount += 1;
  const count = $('pedoCount');
  if (count) count.querySelector('strong').textContent = stepCount;
  swingChime();
  playChimeSound();
}

// Web Animations API로 직접 재생 — 빠른 연타에도 확실히 재시작.
function swingChime() {
  if (!chimeEl) return;
  chimeEl.animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(7deg)', offset: 0.14 },
      { transform: 'rotate(-5deg)', offset: 0.38 },
      { transform: 'rotate(2.6deg)', offset: 0.60 },
      { transform: 'rotate(-1.2deg)', offset: 0.80 },
      { transform: 'rotate(0deg)' },
    ],
    { duration: 1300, easing: 'cubic-bezier(.22,.9,.32,1)' },
  );
}

// 걸음마다 짧은 종소리 — 외부 음원 없이 Web Audio로 합성.
let audioCtx = null;
function unlockChimeAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) audioCtx = new Ctx();
}
function playChimeSound() {
  unlockChimeAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  gain.connect(audioCtx.destination);

  [880, 1320, 1760].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const partialGain = audioCtx.createGain();
    partialGain.gain.value = i === 0 ? 1 : 0.28 / i;
    osc.connect(partialGain);
    partialGain.connect(gain);
    osc.start(now);
    osc.stop(now + 1.1);
  });
}

// ── 소리 음소거 ───────────────────────────────────────────
let audioMuted = false;
function toggleMute() {
  audioMuted = !audioMuted;
  setMuted(audioMuted);
  $('muteBtn').classList.toggle('muted', audioMuted);
  $('muteBtn').setAttribute('aria-label', audioMuted ? '소리 켜기' : '소리 끄기');
}

// ── 공명 파동 ─────────────────────────────────────────────
function ripple(text) {
  const n = el('div', 'ripple'); n.textContent = text;
  $('ripples').appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

// ── 생명주기 ──────────────────────────────────────────────
window.addEventListener('beforeunload', () => { leave(channel); stopAll(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && channel) ripple('돌아오셨네요');
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
