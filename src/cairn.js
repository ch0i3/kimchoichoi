// 돌탑(cairn) 중앙 인터랙션 — HTML5 Canvas.
//
// 머문 경과시간에 따라 돌이 하나씩 얹혀 탑이 된다. 탑이 완성되면(maxStones)
// 뒤로 물러나 배경처럼 둘러쌓이고, 앞에서 새 탑이 다시 자란다.
// 달항아리풍 파스텔 그라디언트 무드. 전적으로 '머문 경과시간'으로 구동.
//
// 사용:  const cairn = createCairn(canvasEl);
//        cairn.start();            // 머무름 시작(경과 0부터)
//        cairn.addStone();         // 108배/공명 등으로 돌 한 개 즉시 얹기
//        cairn.reset();            // 방 전환 시 초기화
//        cairn.config.stoneIntervalMs = 8000;  // 돌 하나 얹히는 간격 조정
//        cairn.stop();             // 정리

const PALETTES = {
  // 달항아리 크림 → 파스텔. accent 로 채널색을 살짝 섞는다.
  base: ['#F6EFE6', '#EFE3D3', '#E7D6C4'],
  stone: ['#EAD9C6', '#D9C3AC', '#C9B79E', '#BCA588', '#D6C4B0'],
};

function lerp(a, b, t) { return a + (b - a) * t; }

// 결정적 의사난수(돌마다 안정적인 흔들림) — Math.random 대신 index 기반.
function jitter(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

export function createCairn(canvas) {
  const ctx = canvas.getContext('2d');

  const config = {
    stoneIntervalMs: 8000, // 돌 하나 얹히는 시간 간격
    maxStones: 9,          // 이만큼 쌓이면 탑 완성 → 뒤로 물러남
    accent: '#7B8840',     // 채널 무드색(섞임)
  };

  let dpr = 1;
  let W = 0, H = 0;
  let startTime = 0;         // 머무름 시작 시각
  let running = false;
  let raf = 0;

  let bonusStones = 0;       // addStone()으로 추가된 돌 수
  let lastStoneCount = 0;    // 등장 애니메이션용
  let stoneBornAt = 0;
  /** @type {{x:number,scale:number,alpha:number,stones:number}[]} 뒤로 물러난 탑들 */
  const background = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function elapsed() {
    return running ? Date.now() - startTime : 0;
  }

  // 시간 기반 돌 개수 + 보너스. maxStones 초과분은 새 탑으로 넘긴다.
  function currentStoneCount() {
    const timed = Math.floor(elapsed() / config.stoneIntervalMs);
    return timed + bonusStones;
  }

  function drawBackground() {
    const g = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.05, W / 2, H * 0.5, H * 0.9);
    g.addColorStop(0, PALETTES.base[0]);
    g.addColorStop(0.6, PALETTES.base[1]);
    g.addColorStop(1, PALETTES.base[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // accent 색의 아주 옅은 후광
    const halo = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H * 0.55);
    halo.addColorStop(0, hexToRgba(config.accent, 0.10));
    halo.addColorStop(1, hexToRgba(config.accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
  }

  // 돌 하나: 부드러운 타원 + 위쪽 하이라이트 + 아래 그림자.
  function drawStone(cx, cy, rx, ry, colorIndex, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // 그림자
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.55, rx * 0.95, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,100,80,0.12)';
    ctx.fill();

    // 몸체
    const base = PALETTES.stone[colorIndex % PALETTES.stone.length];
    const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
    grad.addColorStop(0, lightenHex(base, 0.16));
    grad.addColorStop(1, darkenHex(base, 0.10));
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 위쪽 하이라이트
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.22, cy - ry * 0.35, rx * 0.45, ry * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,252,246,0.35)';
    ctx.fill();
    ctx.restore();
  }

  // 탑 하나 그리기. n개의 돌을 아래에서 위로. baseX 중심, scale/alpha 로 원근.
  function drawTower(n, baseX, baseY, scale, alpha, growT) {
    const unit = Math.min(W, H);
    const rxBottom = unit * 0.11 * scale;
    const gap = unit * 0.052 * scale;

    for (let i = 0; i < n; i++) {
      const shrink = 1 - i * 0.06;              // 위로 갈수록 살짝 작게
      const rx = rxBottom * shrink;
      const ry = rx * 0.62;
      const wob = (jitter(i + 1) - 0.5) * rxBottom * 0.5; // 좌우 흔들림
      const cx = baseX + wob;
      const cy = baseY - i * (gap + ry);

      // 맨 위 돌이 방금 얹혔으면 살짝 떨어지는 등장 연출
      let a = alpha, oy = 0;
      if (i === n - 1 && growT < 1) {
        a *= growT;
        oy = -(1 - growT) * ry * 1.4;
      }
      drawStone(cx, cy + oy, rx, ry, i, a);
    }
  }

  function frame() {
    if (!running) return;
    resizeIfNeeded();
    drawBackground();

    // 뒤로 물러난 탑들(배경)
    for (const t of background) {
      drawTower(t.stones, t.x, H * 0.82, t.scale, t.alpha, 1);
    }

    let n = currentStoneCount();

    // 탑 완성 → 뒤로 물러나 배경으로, 앞에서 새 탑 시작
    while (n > config.maxStones) {
      const side = background.length % 2 === 0 ? -1 : 1;
      background.push({
        x: W / 2 + side * W * (0.16 + 0.05 * background.length),
        scale: 0.62,
        alpha: 0.5,
        stones: config.maxStones,
      });
      if (background.length > 8) background.shift();
      // 완성분만큼 기준선을 올린다: 시간/보너스를 소진 처리
      const consumed = config.maxStones;
      startTime += consumed * config.stoneIntervalMs; // 시간분 소진
      // 보너스는 시간분으로 다 못 채우면 남겨두되, 넘치면 줄인다
      const timedNow = Math.floor((Date.now() - startTime) / config.stoneIntervalMs);
      bonusStones = Math.max(0, n - config.maxStones - timedNow);
      n = currentStoneCount();
    }

    // 새로 얹힌 돌 감지 → 등장 애니메이션 타이밍
    if (n !== lastStoneCount) {
      lastStoneCount = n;
      stoneBornAt = Date.now();
    }
    const growT = Math.min(1, (Date.now() - stoneBornAt) / 650);

    drawTower(n, W / 2, H * 0.82, 1, 1, growT);

    raf = requestAnimationFrame(frame);
  }

  let cssW = 0, cssH = 0;
  function resizeIfNeeded() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width !== cssW || rect.height !== cssH) {
      cssW = rect.width; cssH = rect.height;
      resize();
    }
  }

  function start() {
    if (running) return;
    resize();
    cssW = canvas.getBoundingClientRect().width;
    cssH = canvas.getBoundingClientRect().height;
    startTime = Date.now();
    running = true;
    lastStoneCount = -1;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function reset() {
    background.length = 0;
    bonusStones = 0;
    lastStoneCount = -1;
    startTime = Date.now();
    if (running) { drawBackground(); }
  }

  /** 돌 한 개 즉시 얹기(108배 완료·공명 등). */
  function addStone() {
    bonusStones += 1;
  }

  window.addEventListener('resize', resizeIfNeeded);

  return { start, stop, reset, addStone, config };
}

// ── 색 유틸 ────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}
function hexToRgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function lightenHex(hex, t) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(lerp(r, 255, t))},${Math.round(lerp(g, 255, t))},${Math.round(lerp(b, 255, t))})`;
}
function darkenHex(hex, t) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(lerp(r, 0, t))},${Math.round(lerp(g, 0, t))},${Math.round(lerp(b, 0, t))})`;
}
