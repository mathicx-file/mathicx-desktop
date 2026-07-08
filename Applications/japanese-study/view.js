const JapaneseStudyView = {
  id: 'japanese-study',
  iframe: null,
  container: null,
  baseUrl: '/Applications/japanese-study/',

  async mount(container) {
    this.container = container;
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.src = `${this.baseUrl}index.html`;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.background = 'transparent';
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-storage-access-by-user-activation');

      iframe.onload = () => {
        resolve();
      };

      iframe.onerror = () => {
        reject(new Error(`Failed to load Japanese Study app`));
      };

      container.appendChild(iframe);
      this.iframe = iframe;
    });
  },

  async unmount() {
    if (this.iframe && this.container) {
      this.container.removeChild(this.iframe);
    }
    this.iframe = null;
    this.container = null;
  },

  postMessage(type, payload) {
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage({ type, value: payload, payload }, window.location.origin);
    }
  },

  handleHostMessage(event) {
    const { type, value } = event.data || {};
    switch (type) {
      case 'theme':
        if (this.iframe && this.iframe.contentWindow) {
          this.postMessage('theme', value);
        }
        break;
      case 'refresh':
        if (this.iframe) {
          this.iframe.src = this.iframe.src;
        }
        break;
      case 'focus':
        if (this.iframe) {
          this.iframe.contentWindow.focus();
        }
        break;
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JapaneseStudyView;
}
