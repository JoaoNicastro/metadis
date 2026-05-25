import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInput } from '../src/input.js';

describe('input', () => {
  let input;
  let handlers;

  beforeEach(() => {
    handlers = {
      onLeft: vi.fn(),
      onRight: vi.fn(),
      onUp: vi.fn(),
      onDown: vi.fn(),
      onSelect: vi.fn(),
      onBack: vi.fn(),
    };
    input = createInput(handlers);
    input.attach();
  });

  afterEach(() => {
    input.detach();
  });

  function press(key) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }

  it('fires onLeft for ArrowLeft', () => {
    press('ArrowLeft');
    expect(handlers.onLeft).toHaveBeenCalledOnce();
  });

  it('fires onRight for ArrowRight', () => {
    press('ArrowRight');
    expect(handlers.onRight).toHaveBeenCalledOnce();
  });

  it('fires onUp for ArrowUp', () => {
    press('ArrowUp');
    expect(handlers.onUp).toHaveBeenCalledOnce();
  });

  it('fires onDown for ArrowDown', () => {
    press('ArrowDown');
    expect(handlers.onDown).toHaveBeenCalledOnce();
  });

  it('fires onSelect for Enter', () => {
    press('Enter');
    expect(handlers.onSelect).toHaveBeenCalledOnce();
  });

  it('fires onBack for Escape', () => {
    press('Escape');
    expect(handlers.onBack).toHaveBeenCalledOnce();
  });

  it('ignores unknown keys', () => {
    press('a');
    press('Shift');
    expect(handlers.onLeft).not.toHaveBeenCalled();
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it('detach() stops dispatching', () => {
    input.detach();
    press('ArrowLeft');
    expect(handlers.onLeft).not.toHaveBeenCalled();
  });
});
