// Phone / tablet controls: left thumb = virtual joystick, right thumb = drag to look, plus action buttons.
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export function setupTouch({ onLook, onButton }) {
  const state = { x: 0, y: 0, run: false, up: 0 };
  if (!isTouch) return state;
  document.body.classList.add('touch');
  const root = document.getElementById('touch');
  const base = root.querySelector('.stick'), knob = root.querySelector('.knob');
  let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
  const R = 56;
  const canvas = document.querySelector('canvas');
  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && stickId === null) {
        stickId = t.identifier; sx = t.clientX; sy = t.clientY;
        base.style.left = sx - R + 'px'; base.style.top = sy - R + 'px'; base.classList.add('on');
      } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        let dx = t.clientX - sx, dy = t.clientY - sy; const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        state.x = dx / R; state.y = -dy / R;
      } else if (t.identifier === lookId) { onLook(t.clientX - lx, t.clientY - ly); lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; state.x = state.y = 0; knob.style.transform = ''; base.classList.remove('on'); }
      if (t.identifier === lookId) lookId = null;
    }
  };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  for (const b of root.querySelectorAll('button[data-act]')) {
    const act = b.dataset.act;
    if (act === 'up' || act === 'down') {
      const v = act === 'up' ? 1 : -1;
      b.addEventListener('touchstart', (e) => { state.up = v; e.preventDefault(); }, { passive: false });
      b.addEventListener('touchend', () => { state.up = 0; });
    } else b.addEventListener('click', () => { if (act === 'run') { state.run = !state.run; b.classList.toggle('lit', state.run); } else onButton(act); });
  }
  return state;
}
