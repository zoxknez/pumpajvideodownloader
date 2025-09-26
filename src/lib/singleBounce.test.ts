import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { initRandomSingleBounce } from './singleBounce';

describe('initRandomSingleBounce', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('activates a single element immediately and rotates on ticks without repeating when possible', () => {
    document.body.innerHTML = `
      <div class="attention-icon" data-test="a"></div>
      <div class="attention-icon" data-test="b"></div>
      <div class="attention-icon" data-test="c"></div>
    `;

    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.0) // first tick -> index 0
      .mockReturnValueOnce(0.0) // would repeat 0, but logic should rotate to 1
      .mockReturnValueOnce(0.6); // -> index 1 (then rotated to 2 because previous was 1)

    const dispose = initRandomSingleBounce('.attention-icon', 1000);
    const items = Array.from(document.querySelectorAll<HTMLElement>('.attention-icon'));

    expect(items[0].classList.contains('animate-soft-bounce')).toBe(true);
    expect(items[1].classList.contains('animate-soft-bounce')).toBe(false);
    expect(items[2].classList.contains('animate-soft-bounce')).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(items.map((el) => el.classList.contains('animate-soft-bounce'))).toEqual([false, true, false]);

    vi.advanceTimersByTime(1000);
    expect(items.map((el) => el.classList.contains('animate-soft-bounce'))).toEqual([false, false, true]);

    expect(randomSpy).toHaveBeenCalledTimes(3);
    dispose();
  });

  it('cleans up timers and stops toggling classes when disposed', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const clearSpy = vi.spyOn(window, 'clearInterval');

    document.body.innerHTML = '<div class="attention-icon"></div>';
    const dispose = initRandomSingleBounce('.attention-icon', 500);
    const el = document.querySelector<HTMLElement>('.attention-icon');
    expect(el?.classList.contains('animate-soft-bounce')).toBe(true);

    randomSpy.mockClear();
    dispose();
    expect(clearSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(randomSpy).not.toHaveBeenCalled();
    expect(el?.classList.contains('animate-bounce')).toBe(false);
  });
});
