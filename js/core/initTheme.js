(function () {
    const saved = localStorage.getItem('md-reader-theme');
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    const hljsTheme = document.getElementById('hljs-theme');
    if (hljsTheme) {
        hljsTheme.href = theme === 'dark'
            ? 'lib/hljs-github-dark.min.css'
            : 'lib/hljs-github.min.css';
    }
})();
