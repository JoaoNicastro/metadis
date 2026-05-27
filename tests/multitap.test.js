import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMultitap } from '../src/multitap.js';

describe('multitap (two-tier legacy)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onSingle after the window expires when only one tap arrives', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const m = createMultitap({ windowMs: 400, onSingle, onDouble });
    m.tap();
    expect(onSingle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(onSingle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onSingle).toHaveBeenCalledOnce();
    expect(onDouble).not.toHaveBeenCalled();
  });

  it('fires onDouble immediately on second tap inside window, cancels pending single', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const m = createMultitap({ windowMs: 400, onSingle, onDouble });
    m.tap();
    vi.advanceTimersByTime(100);
    m.tap();
    expect(onDouble).toHaveBeenCalledOnce();
    expect(onSingle).not.toHaveBeenCalled();
    // After firing double, advancing past the window must not trigger single.
    vi.advanceTimersByTime(1000);
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('second tap exactly at window boundary still counts as double', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const m = createMultitap({ windowMs: 400, onSingle, onDouble });
    m.tap();
    vi.advanceTimersByTime(399);
    m.tap();
    expect(onDouble).toHaveBeenCalledOnce();
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('tap after the previous single has fired is treated as a new single (not double)', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const m = createMultitap({ windowMs: 400, onSingle, onDouble });
    m.tap();
    vi.advanceTimersByTime(401);
    expect(onSingle).toHaveBeenCalledTimes(1);
    m.tap();
    vi.advanceTimersByTime(401);
    expect(onSingle).toHaveBeenCalledTimes(2);
    expect(onDouble).not.toHaveBeenCalled();
  });

  it('cancel() prevents the pending single from firing', () => {
    const onSingle = vi.fn();
    const m = createMultitap({ windowMs: 400, onSingle });
    m.tap();
    expect(m.isPending()).toBe(true);
    m.cancel();
    expect(m.isPending()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('isPending() reflects timer state', () => {
    const m = createMultitap({ windowMs: 400, onSingle: () => {} });
    expect(m.isPending()).toBe(false);
    m.tap();
    expect(m.isPending()).toBe(true);
    vi.advanceTimersByTime(401);
    expect(m.isPending()).toBe(false);
  });

  it('works without onDouble handler (just fires single)', () => {
    const onSingle = vi.fn();
    const m = createMultitap({ windowMs: 400, onSingle });
    m.tap();
    vi.advanceTimersByTime(401);
    expect(onSingle).toHaveBeenCalledOnce();
  });

  it('works without any handlers (no throw)', () => {
    const m = createMultitap({ windowMs: 100 });
    expect(() => m.tap()).not.toThrow();
    vi.advanceTimersByTime(101);
    expect(() => m.tap()).not.toThrow();
    m.tap();
    expect(() => m.tap()).not.toThrow();
  });
});

describe('multitap (three-tier with onTriple)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onSingle after windowMs when only one tap arrives', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const onTriple = vi.fn();
    const m = createMultitap({
      windowMs: 280,
      tripleWindowMs: 180,
      onSingle, onDouble, onTriple,
    });
    m.tap();
    vi.advanceTimersByTime(281);
    expect(onSingle).toHaveBeenCalledOnce();
    expect(onDouble).not.toHaveBeenCalled();
    expect(onTriple).not.toHaveBeenCalled();
  });

  it('fires onDouble after tripleWindowMs when 2nd tap arrives but no 3rd', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const onTriple = vi.fn();
    const m = createMultitap({
      windowMs: 280,
      tripleWindowMs: 180,
      onSingle, onDouble, onTriple,
    });
    m.tap();
    vi.advanceTimersByTime(100);
    m.tap();
    // Double should NOT fire immediately — needs to wait for triple window.
    expect(onDouble).not.toHaveBeenCalled();
    vi.advanceTimersByTime(179);
    expect(onDouble).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onDouble).toHaveBeenCalledOnce();
    expect(onSingle).not.toHaveBeenCalled();
    expect(onTriple).not.toHaveBeenCalled();
  });

  it('fires onTriple instantly on 3rd tap inside the triple window', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const onTriple = vi.fn();
    const m = createMultitap({
      windowMs: 280,
      tripleWindowMs: 180,
      onSingle, onDouble, onTriple,
    });
    m.tap();
    vi.advanceTimersByTime(100);
    m.tap();
    vi.advanceTimersByTime(100);
    m.tap();
    expect(onTriple).toHaveBeenCalledOnce();
    expect(onDouble).not.toHaveBeenCalled();
    expect(onSingle).not.toHaveBeenCalled();
    // After triple fires, nothing should fire later.
    vi.advanceTimersByTime(1000);
    expect(onDouble).not.toHaveBeenCalled();
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('3rd tap just before triple-window boundary still counts as triple', () => {
    const onDouble = vi.fn();
    const onTriple = vi.fn();
    const m = createMultitap({
      windowMs: 280,
      tripleWindowMs: 180,
      onDouble, onTriple,
    });
    m.tap();
    vi.advanceTimersByTime(50);
    m.tap();
    vi.advanceTimersByTime(179);
    m.tap();
    expect(onTriple).toHaveBeenCalledOnce();
    expect(onDouble).not.toHaveBeenCalled();
  });

  it('3rd tap after triple window has fired double does NOT trigger triple', () => {
    const onDouble = vi.fn();
    const onTriple = vi.fn();
    const m = createMultitap({
      windowMs: 280,
      tripleWindowMs: 180,
      onDouble, onTriple,
    });
    m.tap();
    vi.advanceTimersByTime(50);
    m.tap();
    vi.advanceTimersByTime(181);
    expect(onDouble).toHaveBeenCalledOnce();
    // Lone tap after double — should be treated as a new single sequence.
    const onSingle = vi.fn();
    m.tap();
    expect(onSingle).not.toHaveBeenCalled();
    expect(onTriple).not.toHaveBeenCalled();
  });

  it('cancel() prevents any pending fire', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const onTriple = vi.fn();
    const m = createMultitap({
      windowMs: 280,
      tripleWindowMs: 180,
      onSingle, onDouble, onTriple,
    });
    m.tap();
    m.tap();
    expect(m.isPending()).toBe(true);
    m.cancel();
    expect(m.isPending()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();
    expect(onTriple).not.toHaveBeenCalled();
  });
});
