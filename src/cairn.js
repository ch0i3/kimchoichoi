// 돌탑(cairn) 중앙 인터랙션 — HTML5 Canvas.
//
// Figma "참선" 화면(node 112:483)의 돌탑 일러스트(vector 112:484)를 그대로 재현.
//  - 돌 4개 = 가로 캡슐(모서리 완전 둥금, r = 높이/2), 아래(큼)→위(작음)
//  - 그라디언트: 탑 전체에 걸쳐 위 흰색(불투명) → 아래 흰색(투명) = 달항아리 무드
//  - 상단 inner glow(내부 그림자 흰색)로 도자기 같은 광택
//  - 배경: #CEDDBE 세이지 그린
//
// 인터랙션: 머문 경과시간에 따라 '아래 돌부터' 하나씩 얹힌다.
//           4개가 다 쌓이면(탑 완성) 뒤로 물러나 배경처럼 남고, 새 탑이 다시 자란다.
//
// createCairn(canvas) → { start, stop, reset, addStone, config }

// ── Figma 원본 좌표 (viewBox 224×310, y는 위에서부터) ─────────────
// 아래(index 0) → 위(index 3) 순서. cx=중심x, cy=중심y, w=너비, h=높이(=지름).
const VB_W = 224;
const VB_H = 310;
const STONES = [
  { cx: 106.5, cy: 261.0, w: 213, h: 98 }, // 0 바닥(가장 큼)
  { cx: 130.5, cy: 169.0, w: 187, h: 86 }, // 1
  { cx: 99.5,  cy: 88.5,  w: 175, h: 75 }, // 2
  { cx: 130.5, cy: 25.5,  w: 113, h: 51 }, // 3 꼭대기(가장 작음)
];
const MAX_STONES = STONES.length; // 4 = 탑 완성

export function createCairn(canvas) {
  const ctx = canvas.getContext('2d');

  const config = {
    stoneIntervalMs: 5000,   // 돌 하나가 얹히는 시간 간격
    background: '#CEDDBE',    // 참선 배경(세이지 그린)
    towerCenterY: 0.56,       // 캔버스 높이 대비 탑 중심 위치
    towerWidthRatio: 0.62,    // 캔버스 너비 대비 탑 폭
    towerHeightRatio: 0.5,    // 캔버스 높이 대비 탑 높이
  };

  let dpr = 1, W = 0, H = 0, cssW = 0, cssH = 0;
  let startTime = 0, running = false, raf = 0;
  let bonus = 0;              // addStone()으로 추가된 돌
  let prevCount = -1, bornAt = 0;
  /** @type {{side:number, x:number, scale:number, alpha:number, jit:object[]}[]} 완성돼 물러난 돌탑(한 묶음) */
  const receded = [];
  let completedCount = 0;

  // 돌마다 살짝 다른 위치/크기(균형은 유지). 탑마다 한 번 정하고 그 탑이 사는 동안 고정.
  const rand = (a) => (Math.random() * 2 - 1) * a;
  const makeJit = () => STONES.map((s, i) => ({
    dx: rand(3 + i * 3.5),   // 위로 갈수록 좌우로 조금 더 흔들림
    dy: rand(1.5 + i * 1.2),
    dw: rand(4),             // 너비도 살짝
  }));
  let currentJit = makeJit();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    cssW = r.width; cssH = r.height;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function resizeIfNeeded() {
    const r = canvas.getBoundingClientRect();
    if (r.width !== cssW || r.height !== cssH) resize();
  }

  const elapsed = () => (running ? Date.now() - startTime : 0);
  const stoneCount = () => Math.floor(elapsed() / config.stoneIntervalMs) + bonus;

  // 탑 배치 계산: viewBox → 캔버스 좌표 매핑
  function layout() {
    const scale = Math.min(
      (W * config.towerWidthRatio) / VB_W,
      (H * config.towerHeightRatio) / VB_H,
    );
    const towerW = VB_W * scale;
    const towerH = VB_H * scale;
    const originX = W / 2 - towerW / 2;
    const originY = H * config.towerCenterY - towerH / 2;
    return { scale, towerW, towerH, originX, originY };
  }

  // 가로 캡슐 path (모서리 완전 둥금)
  function capsulePath(cx, cy, w, h) {
    const r = h / 2;
    const x = cx - w / 2, y = cy - h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  // 돌 하나 그리기 (탑 그라디언트를 공유해 위 흰색 → 아래 투명)
  function drawStone(s, L, grad, alpha, dyAnim, jit) {
    const jx = jit ? jit.dx : 0, jy = jit ? jit.dy : 0, jw = jit ? jit.dw : 0;
    const cx = L.originX + (s.cx + jx) * L.scale;
    const cy = L.originY + (s.cy + jy) * L.scale + dyAnim;
    const w = (s.w + jw) * L.scale;
    const h = s.h * L.scale;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 아주 옅은 바깥 그림자(깊이감)
    ctx.shadowColor = 'rgba(120,140,100,0.18)';
    ctx.shadowBlur = 18 * L.scale * 2;
    ctx.shadowOffsetY = 6;
    capsulePath(cx, cy, w, h);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 상단 inner glow (Figma inner shadow 흰색 근사)
    capsulePath(cx, cy, w, h);
    ctx.clip();
    const g2 = ctx.createLinearGradient(cx, cy - h / 2, cx, cy - h / 2 + h * 0.55);
    g2.addColorStop(0, 'rgba(255,255,255,0.9)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  // 탑 하나 그리기. n = 이 탑에 보일 돌 개수. growT = 최신 돌 등장 진행도(0~1).
  function drawTower(n, L, growT, globalAlpha = 1, jit = null) {
    // 탑 전체 세로 그라디언트: 위 흰색(불투명) → 아래 흰색(투명)
    const grad = ctx.createLinearGradient(0, L.originY, 0, L.originY + L.towerH * 1.016);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');

    for (let i = 0; i < n && i < MAX_STONES; i++) {
      const isNewest = i === n - 1 && growT < 1;
      const a = globalAlpha * (isNewest ? growT : 1);
      const dyAnim = isNewest ? -(1 - growT) * 16 : 0; // 살짝 위에서 내려앉음
      drawStone(STONES[i], L, grad, a, dyAnim, jit ? jit[i] : null);
    }
  }

  function frame() {
    if (!running) return;
    resizeIfNeeded();

    // 투명 클리어 (페이지 배경색 + 배경 도형이 비치도록)
    ctx.clearRect(0, 0, W, H);

    const L = layout();

    const baseBottom = L.originY + L.towerH; // 돌탑이 서는 바닥선

    let n = stoneCount();

    // 탑 완성 → '완성된 돌탑 한 묶음'을 물러나게 (중앙 원본 위치에서 출발해 옆으로 미끄러짐)
    while (n > MAX_STONES) {
      const side = completedCount % 2 === 0 ? -1 : 1;
      receded.push({ side, x: 0, scale: 1, alpha: 0.55, jit: currentJit });
      currentJit = makeJit();          // 새 탑은 새 배치
      completedCount += 1;
      if (receded.length > 6) receded.shift();
      startTime += MAX_STONES * config.stoneIntervalMs;
      const timedNow = Math.floor((Date.now() - startTime) / config.stoneIntervalMs);
      bonus = Math.max(0, n - MAX_STONES - timedNow);
      n = stoneCount();
    }

    // 물러난 돌탑들: 같은 쪽에서 새것일수록 앞(가깝고 진하게). 목표 위치로 부드럽게 이징.
    const depth = { '-1': 0, '1': 0 };
    for (let i = receded.length - 1; i >= 0; i--) {
      const t = receded[i];
      const d = depth[t.side]++;
      const tx = t.side * W * (0.30 + 0.12 * d);       // 좌우 고정 슬롯 (무한정 안 밀림)
      const ts = Math.max(0.55, 0.82 - 0.08 * d);      // 뒤로 갈수록 작게
      const ta = Math.max(0.12, 0.32 - 0.09 * d);      // 뒤로 갈수록 흐리게
      t.x += (tx - t.x) * 0.12;
      t.scale += (ts - t.scale) * 0.12;
      t.alpha += (ta - t.alpha) * 0.12;
    }

    // 작고 흐린(뒤) 것부터 그려 앞쪽이 위로. 모두 바닥선에 정렬해 '둘러쌓인' 느낌.
    for (const t of [...receded].sort((a, b) => a.scale - b.scale)) {
      const scale = L.scale * t.scale;
      const towerW = VB_W * scale, towerH = VB_H * scale;
      const rl = { scale, towerW, towerH, originX: W / 2 - towerW / 2 + t.x, originY: baseBottom - towerH };
      drawTower(MAX_STONES, rl, 1, t.alpha, t.jit);
    }

    // 중앙에서 자라는 탑 (맨 앞)
    if (n !== prevCount) { prevCount = n; bornAt = Date.now(); }
    const growT = Math.min(1, (Date.now() - bornAt) / 600);
    drawTower(n, L, growT, 1, currentJit);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    resize();
    startTime = Date.now();
    running = true;
    prevCount = -1;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function reset() {
    receded.length = 0;
    completedCount = 0;
    currentJit = makeJit();
    bonus = 0;
    prevCount = -1;
    startTime = Date.now();
  }
  /** 돌 한 개 즉시 얹기(108배 완료·공명 등). */
  function addStone() { bonus += 1; }

  window.addEventListener('resize', resizeIfNeeded);
  return { start, stop, reset, addStone, config };
}
