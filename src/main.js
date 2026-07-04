// 앱 진입: 입장 → 4채널 스와이프 → 채널별 realtime · 돌탑 · 사이드바 · 108탭.
import './style.css';
import { CHANNELS, DEFAULT_CHANNEL, ENTRY_JAR, getChannel, channelIndex } from './channels.js';
import {
  myId, joinRoom, switchRoom, leave, broadcastBeadDone, fmtDuration,
} from './realtime.js';
import { createCairn } from './cairn.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

let name = '';
let channel = null;
let currentSlug = '';
let activeIdx = 0;
let cairn = null;
let cairnCanvas = null;
let beadCount = 0;

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
    page.appendChild(head);

    const illo = el('div', 'illo');
    if (c.kind === 'cairn') {
      cairnCanvas = document.createElement('canvas');
      illo.appendChild(cairnCanvas);
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

  if (c.slug === 'chamseon') { cairn.reset(); cairn.start(); } else { cairn.stop(); }
  switchToRoom(c.slug);
}

// ── Realtime ──────────────────────────────────────────────
const handlers = {
  onSync: renderPresence,
  onBeadDone: ({ name: who }) => { ripple(`${who}님이 번뇌를 내려놓았습니다`); if (currentSlug === 'chamseon') cairn.addStone(); },
  onStone: ({ name: who }) => { ripple(`${who}님이 돌 하나를 얹었습니다`); if (currentSlug === 'chamseon') cairn.addStone(); },
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
