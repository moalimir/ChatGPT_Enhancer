// Two floating controls share viewport clamping, edge docking, pointer/keyboard movement.
export function attachFloatingPanel(panel, handle, { position, onSave, onDrag = () => {} }) {
  const gap = 12;
  const clamp = (value, max = 1) => Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), Math.max(0, max));
  let dock = position || { side: 'right', y: 0.12 };
  let drag = null;
  let localPosition = null;
  let snapTimer;
  let save = Promise.resolve();
  let suppressClick = false;
  let clickTimer;
  let raf;

  function place(left, top) {
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.round(gap + clamp(left - gap, window.innerWidth - rect.width - gap * 2))}px`;
    panel.style.top = `${Math.round(gap + clamp(top - gap, window.innerHeight - rect.height - gap * 2))}px`;
    panel.style.right = panel.style.bottom = 'auto';
  }
  function layout() {
    if (drag) return;
    const rect = panel.getBoundingClientRect();
    const travel = Math.max(0, window.innerHeight - rect.height - gap * 2);
    place(dock.side === 'left' ? gap : window.innerWidth - rect.width - gap, gap + clamp(dock.y) * travel);
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(() => { raf = null; layout(); });
  }
  function remember(next) {
    dock = localPosition = next;
    panel.classList.add('is-snapping');
    layout();
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => panel.classList.remove('is-snapping'), 220);
    save = save.then(() => onSave(next)).catch(() => {});
  }
  function stop() {
    if (drag) {
      try { handle.releasePointerCapture?.(drag.pointerId); } catch { /* capture already released */ }
    }
    drag = null;
    panel.classList.remove('is-dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
  }
  function start(event) {
    if (event.button !== 0 || event.target.closest('button,input,select,a') && !panel.classList.contains('is-collapsed')) return;
    const rect = panel.getBoundingClientRect();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    onDrag();
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* pointer already ended */ }
    panel.classList.add('is-dragging');
    place(drag.left + dx, drag.top + dy);
  }
  function finish(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    stop();
    if (!moved) return;
    suppressClick = true;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { suppressClick = false; }, 300);
    const rect = panel.getBoundingClientRect();
    const travel = Math.max(0, window.innerHeight - rect.height - gap * 2);
    remember({ side: rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right',
      y: travel ? clamp((rect.top - gap) / travel) : 0 });
  }
  function cancel() { stop(); layout(); }
  function click(event) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function keys(event) {
    if (event.target !== handle || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const travel = Math.max(1, window.innerHeight - panel.getBoundingClientRect().height - gap * 2);
    remember({ side: event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : dock.side,
      y: clamp(dock.y + (event.key === 'ArrowUp' ? -40 : event.key === 'ArrowDown' ? 40 : 0) / travel) });
  }
  handle.tabIndex = 0;
  handle.title = 'Drag to move; use arrow keys to change edge or height';
  handle.addEventListener('pointerdown', start);
  handle.addEventListener('keydown', keys);
  handle.addEventListener('click', click, true);
  window.addEventListener('resize', schedule);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  observer?.observe(panel);
  schedule();
  return {
    layout: schedule,
    update(next) {
      if (!next || !['left','right'].includes(next.side) || !Number.isFinite(next.y)) return;
      if (localPosition && (next.side !== localPosition.side || next.y !== localPosition.y)) return;
      localPosition = null;
      dock = next;
      schedule();
    },
    dispose() {
      stop(); clearTimeout(snapTimer); clearTimeout(clickTimer);
      if (raf) window.cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      handle.removeEventListener('pointerdown', start);
      handle.removeEventListener('keydown', keys);
      handle.removeEventListener('click', click, true);
    }
  };
}
