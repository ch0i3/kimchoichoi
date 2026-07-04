// 번뇌 — 달항아리 물 비우기 인터랙션 (HTML5 Canvas).
//
// Figma "번뇌" 달항아리(Union, node 112:539)의 실루엣에 물을 채우고,
// 탭할 때마다 수위가 내려가며(번뇌를 비움) 물결·파동·물방울이 인다.
// 108번 탭하면 완전히 비워진다.
//
// createJar(canvas, { tapsToEmpty, onTap, onEmpty }) → { start, stop, reset, config }

const JAR_PATH = 'M202.912 43.1087C259.645 64.5003 300 119.291 300 183.508C300 243.047 265.31 294.484 215.04 318.711L232.666 333.242C237.014 336.827 234.48 343.886 228.845 343.886H71.1549C65.5204 343.886 62.9859 336.827 67.3335 333.242L84.959 318.711C34.6894 294.484 0 243.047 0 183.508C0 118.992 40.7319 63.9894 97.882 42.8115L89.2693 0H210.731L202.912 43.1087Z';
const VBW = 300, VBH = 344;
const Y_FULL = 58;    // 가득 찼을 때 수면 y (몸통 상단, 목 아래)
const Y_EMPTY = 316;  // 다 비웠을 때 수면 y (몸통 바닥)

export function createJar(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const jar = new Path2D(JAR_PATH);
  const config = {
    tapsToEmpty: opts.tapsToEmpty || 108,
    water: '#71A5B7',
    centerY: 0.56, heightRatio: 0.5,
  };

  let level = 1, target = 1, count = 0;   // level 1=가득, 0=비움
  let splash = 0;                          // 탭 직후 물결 증폭(감쇠)
  let phase = 0, last = 0;
  const ripples = [];                      // {x,y,r,born}
  let running = false, raf = 0;
  let dpr = 1, W = 0, H = 0, cssW = 0, cssH = 0, scale = 1, ox = 0, oy = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    cssW = r.width; cssH = r.height;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    scale = (H * config.heightRatio) / VBH;
    ox = W / 2 - (VBW * scale) / 2;
    oy = H * config.centerY - (VBH * scale) / 2;
  }
  function resizeIfNeeded() {
    const r = canvas.getBoundingClientRect();
    if (r.width !== cssW || r.height !== cssH) resize();
  }

  const waterY = () => Y_EMPTY - level * (Y_EMPTY - Y_FULL);

  function drawWaterSurface(y, amp) {
    ctx.moveTo(0, VBH);
    ctx.lineTo(0, y);
    for (let x = 0; x <= VBW; x += 6) {
      const yy = y + Math.sin(x * 0.045 + phase) * amp * 0.6
                   + Math.sin(x * 0.021 - phase * 1.3) * amp * 0.4;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(VBW, VBH);
    ctx.closePath();
  }

  function frame(ts) {
    if (!running) return;
    resizeIfNeeded();
    const dt = last ? Math.min(64, ts - last) : 16; last = ts;
    phase += dt * 0.004;
    level += (target - level) * 0.10;
    splash *= 0.94;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // 항아리 안쪽만 그리도록 클립
    ctx.save();
    ctx.clip(jar);

    // 빈 유리(달항아리) — 흰색 그라디언트
    const glass = ctx.createLinearGradient(0, 0, 0, VBH);
    glass.addColorStop(0, 'rgba(255,255,255,0.55)');
    glass.addColorStop(1, 'rgba(255,255,255,0.16)');
    ctx.fillStyle = glass; ctx.fillRect(0, 0, VBW, VBH);

    // 물
    const y = waterY();
    const amp = 3 + splash;
    ctx.beginPath();
    drawWaterSurface(y, amp);
    const wg = ctx.createLinearGradient(0, y - 20, 0, VBH);
    wg.addColorStop(0, hexA(lighten(config.water, 0.28), 0.72));
    wg.addColorStop(1, hexA(config.water, 0.62));
    ctx.fillStyle = wg; ctx.fill();

    // 수면 하이라이트
    ctx.beginPath();
    for (let x = 0; x <= VBW; x += 6) {
      const yy = y + Math.sin(x * 0.045 + phase) * amp * 0.6 + Math.sin(x * 0.021 - phase * 1.3) * amp * 0.4;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();

    // 물방울(탭 파동)
    for (const rp of ripples) {
      const t = (ts - rp.born) / 900;
      if (t >= 1) continue;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 6 + t * 46, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.4 * (1 - t)})`;
      ctx.lineWidth = 2; ctx.stroke();
    }
    for (let i = ripples.length - 1; i >= 0; i--) if (ts - ripples[i].born > 900) ripples.splice(i, 1);

    ctx.restore(); // unclip

    // 상단 도자기 광택
    ctx.save();
    ctx.clip(jar);
    const sheen = ctx.createLinearGradient(0, 0, 0, VBH * 0.45);
    sheen.addColorStop(0, 'rgba(255,255,255,0.5)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, VBW, VBH * 0.45);
    ctx.restore();

    ctx.restore(); // transform
    raf = requestAnimationFrame(frame);
  }

  // 캔버스 좌표 → viewBox 좌표
  function toVB(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - ox) / scale, y: (clientY - r.top - oy) / scale };
  }

  function onPointer(e) {
    if (count >= config.tapsToEmpty) return;
    count += 1;
    target = Math.max(0, 1 - count / config.tapsToEmpty);
    splash = 12;
    const p = toVB(e.clientX, e.clientY);
    ripples.push({ x: p.x, y: Math.max(waterY(), p.y), r: 0, born: performance.now() });
    opts.onTap?.(count, config.tapsToEmpty - count);
    if (count >= config.tapsToEmpty) opts.onEmpty?.();
  }
  canvas.addEventListener('pointerdown', onPointer);

  function start() {
    if (running) return;
    resize();
    running = true; last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function reset() {
    level = 1; target = 1; count = 0; splash = 0; ripples.length = 0;
  }

  window.addEventListener('resize', resizeIfNeeded);
  return { start, stop, reset, config, get count() { return count; } };
}

// ── 색 유틸 ──
function hexToRgb(h) {
  h = h.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function hexA(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function lighten(hex, t) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => Math.round(v + (255 - v) * t);
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
