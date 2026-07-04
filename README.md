# 온라인 도량 (Onul Doryang)

디지털에서 잠시 벗어나 **함께 머무는** 온라인 도량(디지털 템플스테이) 웹앱.
로그인 없음 · 저장 없음 · 완전 휘발성. Supabase Realtime(Presence + Broadcast) 기반.

## 실행

```bash
cp .env.example .env      # Supabase URL / anon key 입력
npm install
npm run dev               # http://localhost:5173
```

`.env` (Vite 규약):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
```

> Supabase 대시보드 → Project Settings → API 에서 `Project URL`, `anon public key` 복사.
> Realtime 은 별도 테이블 설정 없이 채널만으로 동작한다. `service_role` key 는 절대 넣지 말 것.

## 구조

```
index.html            입장 화면 + 머무는 화면 마크업
vite.config.js
src/
  main.js             앱 진입: 입장 → 방 참여 → UI/인터랙션 연결
  realtime.js         Supabase Presence/Broadcast 래퍼 (joinRoom/switchRoom/leave …)
  channels.js         채널(방) 설정
  cairn.js            돌탑 중앙 인터랙션 (Canvas) — createCairn(canvas)
  style.css           달항아리풍 파스텔 무드
```

## 백엔드 개념

- **Presence** = 동석(누가 함께 있나) + 전광판(각자 머문 시간) + N명 + 공동 도량(Σ 머문시간).
- **Broadcast** = 실시간 공명(108배 완료 `bead_done`, 돌 얹힘 `stone`) — 선택.
- **DB 테이블 0개.** 저장하지 않는 것이 버그가 아니라 컨셉이다.
- 머문 시간은 전부 클라이언트에서 `now - joinedAt` 으로 계산(서버 왕복 없음, 1초 갱신).
- 탭 이탈은 벌점 없음. 재접속 시 `joinedAt` 유지 → 경과시간이 끊기지 않는다.

## `realtime.js` API

```js
import { joinRoom, switchRoom, leave, broadcastBeadDone, deriveBoard, myId } from './realtime.js';

const channel = joinRoom('chamseon', name, { onSync, onBeadDone, onStone });
await switchRoom(channel, 'pohaeng', name, handlers);   // 방 전환(이전 방 자동 퇴장)
broadcastBeadDone(channel, name);                        // 108배 공명
await leave(channel);                                    // 나가기

// onSync 로 넘어오는 board: { count, people:[{id,name,joinedAt,stayedMs}], totalMs }
```

돌탑은 `board` 에서 내 항목(`people.find(p => p.id === myId)`)의 `stayedMs` 로 구동된다.

자세한 서비스/백엔드 명세는 `BACKEND_SPEC.md` 참조.
