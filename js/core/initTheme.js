(function () {
    const validThemes = new Set(['light', 'paper', 'sage', 'dark', 'midnight']);
    const darkThemes = new Set(['dark', 'midnight']);
    const saved = localStorage.getItem('md-reader-theme');
    const theme = (saved && validThemes.has(saved))
        ? saved
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const isDark = darkThemes.has(theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.colorScheme = isDark ? 'dark' : 'light';
    const hljsTheme = document.getElementById('hljs-theme');
    if (hljsTheme) {
        hljsTheme.href = isDark
            ? 'lib/hljs-github-dark.min.css'
            : 'lib/hljs-github.min.css';
    }
})();
