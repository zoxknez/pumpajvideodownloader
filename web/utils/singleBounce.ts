'use client';

export function initRandomSingleBounce(selector = '.attention-icon', intervalMs = 2400) {
  let disposed = false;
  let previousIndex = -1;

  const tick = () => {
    if (disposed) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (!nodes.length) return;

    for (const node of nodes) {
      node.classList.remove('animate-bounce');
      node.classList.remove('animate-soft-bounce');
    }

    let idx = Math.floor(Math.random() * nodes.length);
    if (nodes.length > 1 && idx === previousIndex) {
      idx = (idx + 1) % nodes.length;
    }
    previousIndex = idx;

    nodes[idx].classList.add('animate-soft-bounce');
  };

  tick();
  const timer = window.setInterval(tick, intervalMs);

  return () => {
    disposed = true;
    if (timer) window.clearInterval(timer);
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const node of nodes) {
      node.classList.remove('animate-bounce');
      node.classList.remove('animate-soft-bounce');
    }
  };
}
