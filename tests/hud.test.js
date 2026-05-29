import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHud } from '../src/hud.js';

describe('createHud', () => {
  let mount;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  it('mounts a hud-layer with mode glyph, 4 edges, legend and onboard card', () => {
    createHud(mount);
    expect(mount.querySelector('.hud-layer')).toBeTruthy();
    expect(mount.querySelector('.hud-mode')).toBeTruthy();
    expect(mount.querySelector('.hud-edge-top')).toBeTruthy();
    expect(mount.querySelector('.hud-edge-bottom')).toBeTruthy();
    expect(mount.querySelector('.hud-edge-left')).toBeTruthy();
    expect(mount.querySelector('.hud-edge-right')).toBeTruthy();
    expect(mount.querySelector('.hud-legend')).toBeTruthy();
    expect(mount.querySelector('.hud-onboard')).toBeTruthy();
  });

  it('setMode renders an uppercased name, index/total, and the 4 edge labels', () => {
    const hud = createHud(mount);
    hud.setMode({
      name: 'display',
      index: 2,
      total: 6,
      edges: { up: 'next style', down: 'prev style', left: 'prev', right: 'next' },
    });
    expect(mount.querySelector('.hud-mode').textContent).toBe('DISPLAY');
    expect(mount.querySelector('.hud-sub').textContent).toBe('3/6');
    expect(mount.querySelector('.hud-edge-top').textContent).toBe('next style');
    expect(mount.querySelector('.hud-edge-bottom').textContent).toBe('prev style');
    expect(mount.querySelector('.hud-edge-left').textContent).toBe('prev');
    expect(mount.querySelector('.hud-edge-right').textContent).toBe('next');
  });

  it('setMode appends an extra string to the sub line', () => {
    const hud = createHud(mount);
    hud.setMode({ name: 'scale', index: 1, total: 6, extra: '1.50x' });
    expect(mount.querySelector('.hud-sub').textContent).toBe('2/6 · 1.50x');
  });

  it('setMode tolerates missing edges', () => {
    const hud = createHud(mount);
    expect(() => hud.setMode({ name: 'rotate', index: 0, total: 5 })).not.toThrow();
    expect(mount.querySelector('.hud-edge-top').textContent).toBe('');
  });

  it('flash() toggles the bright pulse class then clears it after the timeout', () => {
    vi.useFakeTimers();
    const hud = createHud(mount);
    hud.flash();
    const flashEl = mount.querySelector('.hud-flash');
    const glyphEl = mount.querySelector('.hud-mode');
    expect(flashEl.classList.contains('on')).toBe(true);
    expect(glyphEl.classList.contains('bright')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(flashEl.classList.contains('on')).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(glyphEl.classList.contains('bright')).toBe(false);
    vi.useRealTimers();
  });

  it('onboard starts hidden; show/hide toggle visibility', () => {
    const hud = createHud(mount);
    expect(hud.isOnboardVisible()).toBe(false);
    hud.showOnboard();
    expect(hud.isOnboardVisible()).toBe(true);
    hud.hideOnboard();
    expect(hud.isOnboardVisible()).toBe(false);
  });

  it('returns an inert API when there is no document', () => {
    const hud = createHud(mount, null);
    expect(() => hud.setMode({ name: 'x' })).not.toThrow();
    expect(() => hud.flash()).not.toThrow();
    expect(hud.isOnboardVisible()).toBe(false);
    expect(hud.el).toBeNull();
  });
});
