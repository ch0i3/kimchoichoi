// 앱 진입: 입장 → 4채널 스와이프 → 채널별 realtime · 돌탑 · 사이드바 · 108탭.
import './style.css';
import { CHANNELS, DEFAULT_CHANNEL, ENTRY_JAR, getChannel, channelIndex } from './channels.js';
import {
  myId, joinRoom, switchRoom, leave, broadcastBeadDone, broadcastChat, fmtDuration,
} from './realtime.js';
import { createCairn } from './cairn.js';
import { createPedometer } from './pedometer.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

let name = '';
let channel = null;
let currentSlug = '';
let activeIdx = 0;
let cairn = null;
let cairnCanvas = null;
let beadCount = 0;
let dadamWaterEl = null;
let waterPct = 0;
const WATER_STEP = 16; // 한마디당 채워지는 비율(%)
let chimeEl = null;
let stepCount = 0;
const pedo = createPedometer(onStep);

// 다담 수면 물결 — path 하나가 완만하게 모양을 바꾸며(SMIL) 실제 물처럼 출렁인다.
const WAVE_SVG = `
  <svg viewBox="0 0 40 16" preserveAspectRatio="none">
    <path fill="#93c968">
      <animate attributeName="d" dur="2.6s" repeatCount="indefinite"
        values="
          M0,8 Q10,3 20,8 T40,8 V16 H0 Z;
          M0,8 Q10,13 20,8 T40,8 V16 H0 Z;
          M0,8 Q10,3 20,8 T40,8 V16 H0 Z" />
    </path>
  </svg>`;

// ── 입장 ──────────────────────────────────────────────────
$('enterJar').src = ENTRY_JAR;
$('enterBtn').onclick = () => enter($('nameInput').value.trim().slice(0, 12) || '무이');
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('enterBtn').click(); });

function enter(nm) {
  name = nm;
  $('enter').classList.add('hidden');
  $('app').classList.remove('hidden');
  buildPages();
  buildSidebar();
  buildIndicator();
  buildBeadCounter();
  buildChatBar();
  cairn = createCairn(cairnCanvas);
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
    } else if (c.slug === 'dadam' && c.illoMask) {
      const wrap = el('div', 'cup-wrap');
      const water = el('div', 'water-fill empty');
      water.style.webkitMaskImage = `url(${c.illoMask})`;
      water.style.maskImage = `url(${c.illoMask})`;
      water.appendChild(el('div', 'water-body'));
      const surface = el('div', 'water-surface');
      surface.innerHTML = WAVE_SVG;
      water.appendChild(surface);
      wrap.appendChild(water);
      const img = document.createElement('img');
      img.src = c.illo; img.alt = '';
      wrap.appendChild(img);
      illo.appendChild(wrap);
      dadamWaterEl = water;
    } else if (c.slug === 'pohaeng' && c.illoInline) {
      const wrap = el('div', 'chime-wrap');
      wrap.innerHTML = c.illoInline;
      const svg = wrap.querySelector('svg');
      svg.classList.add('chime-svg');
      wrap.addEventListener('click', () => onStep()); // 데스크톱 등 센서 없을 때 수동 테스트용
      illo.appendChild(wrap);
      chimeEl = svg;
    } else {
      const img = document.createElement('img');
      img.src = c.illo; img.alt = '';
      if (c.slug === 'beonnoe') img.addEventListener('click', onBeadTap);
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
  const c = CHANNELS[i];
  const root = document.documentElement.style;
  root.setProperty('--bg', c.bg);
  root.setProperty('--ink', c.ink);
  root.setProperty('--accent', c.accent);
  document.body.style.background = c.bg;

  updateIndicator(i);
  updateSidebarActive(c.slug);
  $('beadCounter').classList.toggle('hidden', c.slug !== 'beonnoe');
  $('chatBar').classList.toggle('hidden', !c.chat);
  $('presence').classList.toggle('hidden', !!c.chat);

  if (c.slug === 'chamseon') { cairn.reset(); cairn.start(); } else { cairn.stop(); }
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
  $('pill').textContent = count > 0 ? `지금 ${count}명이 함께 머물고 있어요` : '함께 머무는 중…';
  $('board').innerHTML = people.map((p) => {
    const me = p.id === myId ? ' <em>(나)</em>' : '';
    return `<li><span>${escapeHtml(p.name)}${me}</span><time>${fmtDuration(p.stayedMs)}</time></li>`;
  }).join('');
}

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
      <img class="ch-illo" src="${c.illo || ''}" alt="" />
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
function openSidebar() { $('sidebar').classList.add('open'); $('scrim').classList.add('show'); }
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
  c.innerHTML = `<div class="num">0</div><div class="sub">108번의 탭으로 마음을 비웁니다</div>`;
  $('app').appendChild(c);
}
function onBeadTap(e) {
  beadCount = Math.min(108, beadCount + 1);
  $('beadCounter').querySelector('.num').textContent = beadCount;
  const img = e.currentTarget;
  img.style.transform = 'scale(0.94)';
  setTimeout(() => { img.style.transform = ''; }, 120);
  if (beadCount >= 108) {
    ripple('108배를 마쳤습니다');
    if (channel) broadcastBeadDone(channel, name);
    beadCount = 0;
    setTimeout(() => { $('beadCounter').querySelector('.num').textContent = '0'; }, 500);
  }
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
  dadamWaterEl.style.setProperty('--level', `${pct}%`);
  dadamWaterEl.classList.toggle('empty', pct <= 0);
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
  unlockChimeAudio(); // 버튼 클릭 = 사용자 제스처 → 오디오 컨텍스트 미리 풀어둔다
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

// Web Animations API로 직접 재생 — CSS 클래스 토글 방식은 클릭이 겹치거나
// 빠르게 연타할 때 애니메이션이 재시작되지 않는 경우가 있어 더 확실한 방식으로 교체.
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

// 걸음마다 짧은 종소리(합성음) — 외부 음원 파일 없이 Web Audio로 생성.
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

// ── 공명 파동 ─────────────────────────────────────────────
function ripple(text) {
  const n = el('div', 'ripple'); n.textContent = text;
  $('ripples').appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

// ── 생명주기 ──────────────────────────────────────────────
window.addEventListener('beforeunload', () => leave(channel));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && channel) ripple('돌아오셨네요');
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
