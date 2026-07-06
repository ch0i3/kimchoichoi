// 전체 채널 인원 집계 — 사이드바에 채널별 N명 + 총 N명 표시용.
//
// 앱은 활성 채널 한 곳에만 track(입장)하지만, 사이드바엔 모든 채널 인원이 필요하다.
// 그래서 모든 방을 '관찰자'로 구독(subscribe)만 하고 track 하지 않는다.
// track 은 활성 채널(main.js의 switchToRoom)이 담당하므로, 각 방의 presenceState()
// 는 실제 그 방에 머무는 사람 수를 정확히 반영한다(자기 자신은 활성 방에만 잡힘).

import { createClient } from '@supabase/supabase-js';
import { myId } from './realtime.js';

// 별도 클라이언트 — 활성 채널(realtime.js)과 같은 토픽(room:<slug>)을 구독하므로
// 같은 클라이언트를 쓰면 채널이 충돌한다. 그래서 관찰 전용 클라이언트를 따로 둔다.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 5 } } },
);

/**
 * @param {string[]} slugs 관찰할 채널 slug 목록
 * @param {(counts: Record<string, number>, total: number) => void} onCounts
 */
export function createPresenceHub(slugs, onCounts) {
  const channels = [];
  const counts = {};
  slugs.forEach((s) => (counts[s] = 0));

  function emit() {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    onCounts({ ...counts }, total);
  }

  slugs.forEach((slug) => {
    const ch = supabase.channel(`room:${slug}`, {
      config: { presence: { key: `hub-${myId}` } }, // track 안 하므로 실제로 안 쓰임
    });
    const refresh = () => {
      counts[slug] = Object.values(ch.presenceState()).flat().length;
      emit();
    };
    ch.on('presence', { event: 'sync' }, refresh)
      .on('presence', { event: 'join' }, refresh)
      .on('presence', { event: 'leave' }, refresh)
      .subscribe(); // 순수 관찰자 — track() 하지 않음
    channels.push(ch);
  });

  return {
    destroy() { channels.forEach((c) => supabase.removeChannel(c)); },
  };
}
