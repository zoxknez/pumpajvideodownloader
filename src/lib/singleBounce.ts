// Cycles a bounce animation across elements matching the selector so only one bounces at a time.
// Returns a cleanup function to stop the cycle.
export function initRandomSingleBounce(selector = '.attention-icon', intervalMs = 2400) {
  let disposed = false;
  let timer: number | undefined;
  let previousIndex = -1;

  const tick = () => {
    if (disposed) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (!nodes.length) return;

    // Remove bounce from all
  for (const n of nodes) { n.classList.remove('animate-bounce'); n.classList.remove('animate-soft-bounce'); }

    // Choose a random index different from the previous when possible
    let idx = Math.floor(Math.random() * nodes.length);
    if (nodes.length > 1 && idx === previousIndex) {
      idx = (idx + 1) % nodes.length;
    }
    previousIndex = idx;

  nodes[idx].classList.add('animate-soft-bounce');
  };

  // Prime immediately then cycle
  tick();
  timer = window.setInterval(tick, intervalMs);

  return () => {
    disposed = true;
    if (timer) window.clearInterval(timer);
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const n of nodes) n.classList.remove('animate-bounce');
  };
}
