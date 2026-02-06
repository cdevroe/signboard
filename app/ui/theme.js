const customOverTypeThemes = {
  dark: {
      name: 'dark',
      colors: {
          bgPrimary: '#12200a',
          bgSecondary: '#12200a',
          text: '#e8f0e5',
          strong: 'rgba(237, 242, 235, 1)',
          h1: '#e8f0e5',
          h2: '#e8f0e5',
          h3: '#e8f0e5',
          em: 'rgba(237, 242, 235, 1)',
          link: '#399b3eff',
          code: '#e8f0e5',
          codeBg: 'rgba(56, 142, 60, 0.3)',
          blockquote: '#558b2f',
          hr: '#66bb6a',
          syntaxMarker: 'rgb(39, 133, 46)',
          cursor: '#4caf50',
          selection: 'rgba(42, 74, 23, 0.4)'
      }
  },
  light: {
    name: 'lite',
    colors: {
        bgPrimary: '#ffffff',
        bgSecondary: '#ffffff',
        text: '#2f2f2f',
        strong: '#000000',
        h1: '#2f2f2f',
        h2: '#2f2f2f',
        h3: '#2f2f2f',
        em: '#444444',
        link: '#3366cc',
        code: '#111111',
        codeBg: '#dedadaff',
        blockquote: '#666666',
        hr: '#e0e0e0',
        syntaxMarker: '#999999',
        cursor: '#000000',
        selection: 'rgba(215, 227, 244, 0.4)'
    }
}
};
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const newTheme = current === 'dark' ? '' : 'dark';
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('theme', newTheme);
    
    if ( newTheme == 'dark' ) {
        OverType.setTheme(customOverTypeThemes.dark);
    } else {
        OverType.setTheme(customOverTypeThemes.light);
    }

    if (window.boardRoot && typeof renderBoard === 'function') {
      renderBoard().catch((error) => {
        console.error('Unable to render board after theme change.', error);
      });
    }

  });

  window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('theme');
    if (saved) document.documentElement.dataset.theme = saved;
  });
}
