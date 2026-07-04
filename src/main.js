// 앱 진입: 입장 → 방 참여 → UI/인터랙션 연결.
import './style.css';
import { CHANNELS, DEFAULT_CHANNEL, getChannel } from './channels.js';
import {
  myId, joinRoom, switchRoom, leave, broadcastBeadDone, broadcastStone, fmtDuration,
} from './realtime.js';
import { createCairn } from './cairn.js';

let channel = null;
let name = '';
let currentSlug = DEFAULT_CHANNEL;

const $ = (id) => document.getElementById(id);
const cairn = createCairn($('cairn'));

// ── 렌더링 ────────────────────────────────────────────────
function renderBoard({ count, people, totalMs }) {
  $('count').textContent = `지금 ${count}명이 함께 머무는 중`;
  $('communal').textContent = `함께 채운 도량 · ${fmtDuration(totalMs)}`;

  $('board').innerHTML = people
    .map((p) => {
      const me = p.id === myId ? ' <em>(나)</em>' : '';
      return `<li><span class="who">${escapeHtml(p.name)}${me}</span>` +
        `<time>${fmtDuration(p.stayedMs)}</time></li>`;
    })
    .join('');
}

function renderSidebar() {
  $('channelList').innerHTML = CHANNELS
    .map((c) => {
      const active = c.slug === currentSlug ? ' active' : '';
      const lock = c.locked ? ' locked' : '';
      const badge = c.locked ? '<span class="lock">곧 열림</span>' : '';
      return `<li class="ch${active}${lock}" data-slug="${c.slug}" ${c.locked ? '' : 'role="button" tabindex="0"'}>
        <span class="hanja">${c.hanja}</span>
        <span class="ch-name">${c.name}</span>
        ${badge}
      </li>`;
    })
    .join('');
}

// ── 공명(broadcast 수신) ──────────────────────────────────
function ripple(text) {
  const el = document.createElement('div');
  el.className = 'ripple';
  el.textContent = text;
  $('ripples').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

const handlers = {
  onSync: renderBoard,
  onBeadDone: ({ name: who }) => { ripple(`${who}님이 번뇌를 내려놓았습니다`); cairn.addStone(); },
  onStone: ({ name: who }) => { ripple(`${who}님이 돌 하나를 얹었습니다`); cairn.addStone(); },
  onStatus: (s) => { if (s === 'SUBSCRIBED') $('count').classList.remove('dim'); },
};

// ── 흐름 ──────────────────────────────────────────────────
function applyChannelMood(slug) {
  const ch = getChannel(slug);
  if (!ch) return;
  cairn.config.accent = ch.accent;
  document.documentElement.style.setProperty('--accent', ch.accent);
  $('roomTitle').innerHTML = `<span class="hanja">${ch.hanja}</span> ${ch.name}`;
  $('roomDesc').textContent = ch.desc || '';
}

function enter(inputName) {
  name = inputName;
  currentSlug = DEFAULT_CHANNEL;
  applyChannelMood(currentSlug);
  channel = joinRoom(currentSlug, name, handlers);
  cairn.start();
  $('enter').classList.add('hidden');
  $('app').classList.remove('hidden');
  renderSidebar();
}

async function changeChannel(slug) {
  const ch = getChannel(slug);
  if (!ch || ch.locked || slug === currentSlug) return;
  currentSlug = slug;
  applyChannelMood(slug);
  renderSidebar();
  cairn.reset();
  closeSidebar();
  channel = await switchRoom(channel, slug, name, handlers); // 이전 방 자동 퇴장
}

// ── 사이드바 ──────────────────────────────────────────────
function openSidebar() { $('sidebar').classList.add('open'); $('scrim').classList.add('show'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('scrim').classList.remove('show'); }

// ── 이벤트 바인딩 ─────────────────────────────────────────
$('enterBtn').onclick = () => {
  const v = $('nameInput').value.trim().slice(0, 12) || '무이';
  enter(v);
};
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('enterBtn').click(); });

$('hamburger').onclick = openSidebar;
$('scrim').onclick = closeSidebar;

$('channelList').addEventListener('click', (e) => {
  const li = e.target.closest('.ch');
  if (li && !li.classList.contains('locked')) changeChannel(li.dataset.slug);
});

// 108배 완료 → 공명 + 내 돌탑에도 한 개
$('beadBtn').onclick = () => {
  if (!channel) return;
  broadcastBeadDone(channel, name);
  cairn.addStone();
  ripple('번뇌 하나를 내려놓습니다');
};

// 나가기 = 창 닫기: 정리(안 해도 서버가 곧 자동 정리)
window.addEventListener('beforeunload', () => leave(channel));

// 조용히 돌아오기: UI만 부드럽게, Presence 는 유지/자동 재등록
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && channel) ripple('돌아오셨네요');
});

// ── 유틸 ──────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
