export function createInput(handlers) {
  const map = {
    ArrowLeft: 'onLeft',
    ArrowRight: 'onRight',
    ArrowUp: 'onUp',
    ArrowDown: 'onDown',
    Enter: 'onSelect',
    Escape: 'onBack',
  };

  function onKeyDown(event) {
    const handlerName = map[event.key];
    if (!handlerName) return;
    const handler = handlers[handlerName];
    if (typeof handler === 'function') {
      handler(event);
    }
  }

  return {
    attach() {
      window.addEventListener('keydown', onKeyDown);
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
