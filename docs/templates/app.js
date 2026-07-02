class App {
  constructor() {
    this.container = document.getElementById('app');
    this._listeners = [];
  }

  init() {
    this.setupUI();
    this.setupListeners();
  }

  setupUI() {
    // Configure elementos da UI aqui
  }

  setupListeners() {
    // Registre listeners guardando referência para cleanup
  }

  on(element, event, handler) {
    element.addEventListener(event, handler);
    this._listeners.push({ element, event, handler });
  }

  cleanup() {
    this._listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this._listeners = [];
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  app.init();
});

window.addEventListener('beforeunload', () => {
  if (app) app.cleanup();
});
