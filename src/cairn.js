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
  /** @type {{stones:number, dx:number, scale:number, alpha:number}[]} 뒤로 물러난 탑 */
  const background = [];

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
  function drawStone(s, L, grad, alpha, dy) {
    const cx = L.originX + s.cx * L.scale;
    const cy = L.originY + s.cy * L.scale + dy;
    const w = s.w * L.scale;
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
  function drawTower(n, L, growT, globalAlpha = 1) {
    // 탑 전체 세로 그라디언트: 위 흰색(불투명) → 아래 흰색(투명)
    const grad = ctx.createLinearGradient(0, L.originY, 0, L.originY + L.towerH * 1.016);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');

    for (let i = 0; i < n && i < MAX_STONES; i++) {
      const isNewest = i === n - 1 && growT < 1;
      const a = globalAlpha * (isNewest ? growT : 1);
      const dy = isNewest ? -(1 - growT) * 16 : 0; // 살짝 위에서 내려앉음
      drawStone(STONES[i], L, grad, a, dy);
    }
  }

  function frame() {
    if (!running) return;
    resizeIfNeeded();

    // 배경
    ctx.fillStyle = config.background;
    ctx.fillRect(0, 0, W, H);

    const L = layout();

    // 뒤로 물러난 탑들(배경처럼)
    for (const b of background) {
      const bl = { ...L, scale: L.scale * b.scale, originX: L.originX + b.dx, originY: L.originY + L.towerH * (1 - b.scale) };
      drawTower(MAX_STONES, bl, 1, b.alpha);
    }

    let n = stoneCount();

    // 탑 완성 → 뒤로 물러나고 새 탑 시작
    while (n > MAX_STONES) {
      const side = background.length % 2 === 0 ? -1 : 1;
      background.push({ stones: MAX_STONES, dx: side * W * (0.14 + 0.04 * background.length), scale: 0.6, alpha: 0.45 });
      if (background.length > 6) background.shift();
      startTime += MAX_STONES * config.stoneIntervalMs;
      const timedNow = Math.floor((Date.now() - startTime) / config.stoneIntervalMs);
      bonus = Math.max(0, n - MAX_STONES - timedNow);
      n = stoneCount();
    }

    // 최신 돌 등장 애니메이션
    if (n !== prevCount) { prevCount = n; bornAt = Date.now(); }
    const growT = Math.min(1, (Date.now() - bornAt) / 600);

    drawTower(n, L, growT);
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
    background.length = 0;
    bonus = 0;
    prevCount = -1;
    startTime = Date.now();
  }
  /** 돌 한 개 즉시 얹기(108배 완료·공명 등). */
  function addStone() { bonus += 1; }

  window.addEventListener('resize', resizeIfNeeded);
  return { start, stop, reset, addStone, config };
}
