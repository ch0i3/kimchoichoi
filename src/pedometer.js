// 만보기 — DeviceMotion 가속도 변화량 기반 간이 걸음 감지.
// 정식 Pedometer API는 브라우저 표준이 아니라서, 가속도 크기(magnitude)의
// 급격한 변화를 임계값 + 최소 간격(refractory)으로 걸러 "걸음"으로 판단한다.

const THRESHOLD = 1.15;        // 이 값 이상 튀면 한 걸음으로 인정(m/s²)
const MIN_STEP_INTERVAL_MS = 280; // 걸음 사이 최소 간격(중복 감지 방지)

export function createPedometer(onStep) {
  let lastMag = null;
  let lastStepAt = 0;
  let listening = false;

  function handleMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
    if (lastMag == null) { lastMag = mag; return; }
    const delta = Math.abs(mag - lastMag);
    lastMag = mag;
    const now = Date.now();
    if (delta > THRESHOLD && now - lastStepAt > MIN_STEP_INTERVAL_MS) {
      lastStepAt = now;
      onStep(mag);
    }
  }

  function supported() {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /** iOS는 사용자 제스처(버튼 클릭) 안에서 호출해야 권한 팝업이 뜬다. */
  async function start() {
    if (!supported()) return false;
    const RequestPermission = DeviceMotionEvent.requestPermission;
    if (typeof RequestPermission === 'function') {
      try {
        const res = await RequestPermission();
        if (res !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('devicemotion', handleMotion);
    listening = true;
    return true;
  }

  function stop() {
    if (listening) window.removeEventListener('devicemotion', handleMotion);
    listening = false;
  }

  return { start, stop, supported };
}
