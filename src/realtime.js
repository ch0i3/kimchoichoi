// 온라인 도량 — Supabase Realtime 연동 (Presence + Broadcast)
//
// 정체성: 로그인 없음 · 저장 없음 · 완전 휘발성. DB 테이블을 만들지 않는다.
//  - "지금 누가 함께 있나"  = Presence 로스터
//  - "얼마나 머물렀나"      = now - joinedAt (전적으로 클라이언트 계산)
//  - anon key만으로 Realtime 사용. service_role key는 절대 넣지 않는다.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  // .env 미설정 시 개발 중 빨리 알아채도록.
  console.warn('[realtime] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. .env 를 확인하세요.');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }, // Presence/Broadcast만 → 세션 불필요
  realtime: { params: { eventsPerSecond: 10 } },
});

// 로그인 없음: 세션마다 하나의 익명 UUID. 저장하지 않는다.
export const myId = crypto.randomUUID();

/**
 * @typedef {Object} Person
 * @property {string} id
 * @property {string} name
 * @property {number} joinedAt
 * @property {number} stayedMs   now - joinedAt
 */
/**
 * @typedef {Object} Board
 * @property {number} count      지금 함께 머무는 사람 수 (N명)
 * @property {Person[]} people   joinedAt 오름차순(먼저 온 사람 위) + stayedMs
 * @property {number} totalMs    공동 도량 = Σ(now - joinedAt)
 */

/**
 * 로스터에서 전광판 계산 (머문 시간은 전부 클라이언트에서).
 * @param {{id,name,joinedAt}[]} roster
 * @param {number} [now]
 * @returns {Board}
 */
export function deriveBoard(roster, now = Date.now()) {
  const people = roster
    .map((p) => ({ ...p, stayedMs: Math.max(0, now - p.joinedAt) }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const totalMs = people.reduce((s, p) => s + p.stayedMs, 0);
  return { count: people.length, people, totalMs };
}

/**
 * 방 입장: `room:<slug>` 채널 구독 + presence track.
 * onSync 는 (1) 로스터 변화 시, (2) 1초 로컬 타이머마다 호출된다 → 경과시간이 부드럽게 흐른다.
 *
 * @param {string} slug
 * @param {string} name
 * @param {{
 *   onSync?: (board: Board) => void,
 *   onBeadDone?: (payload: {name: string}) => void,
 *   onStone?: (payload: {name: string}) => void,
 *   onStatus?: (status: string) => void,
 * }} [handlers]
 * @returns {import('@supabase/supabase-js').RealtimeChannel}
 */
export function joinRoom(slug, name, handlers = {}) {
  const { onSync, onBeadDone, onStone, onStatus } = handlers;
  const joinedAt = Date.now(); // 이 방 기준 머문 시작점 — 재접속해도 유지(경과시간 안 끊김)
  let roster = [];
  let ticker = null;

  const channel = supabase.channel(`room:${slug}`, {
    config: { presence: { key: myId } },
  });

  const refresh = () => {
    roster = Object.values(channel.presenceState()).flat();
    onSync?.(deriveBoard(roster));
  };
  channel.on('presence', { event: 'sync' }, refresh);
  channel.on('presence', { event: 'join' }, refresh);
  channel.on('presence', { event: 'leave' }, refresh);

  if (onBeadDone) channel.on('broadcast', { event: 'bead_done' }, ({ payload }) => onBeadDone(payload));
  if (onStone) channel.on('broadcast', { event: 'stone' }, ({ payload }) => onStone(payload));

  channel.subscribe(async (status) => {
    onStatus?.(status);
    if (status === 'SUBSCRIBED') {
      // 재접속 시에도 다시 불린다. joinedAt 은 고정이라 경과시간이 리셋되지 않는다.
      await channel.track({ id: myId, name, joinedAt });
      if (!ticker) ticker = setInterval(() => onSync?.(deriveBoard(roster)), 1000);
    }
  });

  // leave() 에서 타이머를 멈추기 위해 채널에 정리 훅을 붙여둔다.
  channel._stopTicker = () => {
    if (ticker) clearInterval(ticker);
    ticker = null;
  };
  return channel;
}

/**
 * 방 전환 = 이전 채널 제거 후 새 방 입장 (이름 유지).
 * @returns {import('@supabase/supabase-js').RealtimeChannel}
 */
export async function switchRoom(prevChannel, slug, name, handlers) {
  await leave(prevChannel);
  return joinRoom(slug, name, handlers);
}

/** 108배 완료 공명 송신. 수신자는 onBeadDone 으로 받는다. */
export function broadcastBeadDone(channel, name) {
  channel?.send({ type: 'broadcast', event: 'bead_done', payload: { name } });
}

/** 돌 얹힘 공명 송신(선택). 수신자는 onStone 으로 받는다. */
export function broadcastStone(channel, name) {
  channel?.send({ type: 'broadcast', event: 'stone', payload: { name } });
}

/** 방에서 나간다(Presence 소멸 + 타이머 정리). */
export async function leave(channel) {
  if (!channel) return;
  channel._stopTicker?.();
  await supabase.removeChannel(channel);
}

/** ms → "1:23:45" / "12:34" / "방금". 전광판·공동도량 표시용. */
export function fmtDuration(ms) {
  const sec = Math.floor(Math.max(0, ms) / 1000);
  if (sec < 5) return '방금';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
