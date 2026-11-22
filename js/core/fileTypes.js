/**
 * Shared File Type Registry & Binary Guard for mditor v4.0
 * Works in both Electron Main Process (CommonJS) and Renderer (Browser global)
 * Zero external dependencies — strictly plain-text family only.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MditorFileTypes = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const MARKDOWN_EXTS = new Set(['.md', '.markdown', '.mdx', '.mkd', '.mdown']);

    const PLAIN_TEXT_EXTS = new Set(['.txt', '.text', '.log', '.out', '.env', '.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.dockerignore', '.prettierrc', '.eslintrc']);

    const CSV_EXTS = new Set(['.csv', '.tsv']);

    // Maps file extension -> bundled highlight.min.js language identifier
    const CODE_EXT_TO_LANG = {
        '.js': 'javascript',
        '.mjs': 'javascript',
        '.cjs': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.mts': 'typescript',
        '.cts': 'typescript',
        '.tsx': 'typescript',
        '.json': 'json',
        '.jsonc': 'json',
        '.jsonl': 'json',
        '.py': 'python',
        '.pyw': 'python',
        '.sh': 'bash',
        '.bash': 'bash',
        '.zsh': 'bash',
        '.fish': 'shell',
        '.ps1': 'shell',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'scss',
        '.less': 'less',
        '.html': 'xml',
        '.htm': 'xml',
        '.xml': 'xml',
        '.svg': 'xml',
        '.plist': 'xml',
        '.vue': 'xml',
        '.svelte': 'xml',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.toml': 'ini',
        '.ini': 'ini',
        '.conf': 'ini',
        '.cfg': 'ini',
        '.properties': 'ini',
        '.sql': 'sql',
        '.swift': 'swift',
        '.go': 'go',
        '.rs': 'rust',
        '.java': 'java',
        '.kt': 'kotlin',
        '.kts': 'kotlin',
        '.c': 'c',
        '.h': 'c',
        '.cpp': 'cpp',
        '.cc': 'cpp',
        '.cxx': 'cpp',
        '.hpp': 'cpp',
        '.cs': 'csharp',
        '.m': 'objectivec',
        '.mm': 'objectivec',
        '.rb': 'ruby',
        '.php': 'php',
        '.lua': 'lua',
        '.r': 'r',
        '.pl': 'perl',
        '.graphql': 'graphql',
        '.gql': 'graphql',
        '.diff': 'diff',
        '.patch': 'diff',
        '.mk': 'makefile',
        '.nsh': 'ini'
    };

    // Well-known extensionless filenames
    const SPECIAL_FILENAMES = {
        'makefile': { kind: 'code', lang: 'makefile', label: 'Makefile' },
        'gnumakefile': { kind: 'code', lang: 'makefile', label: 'Makefile' },
        'dockerfile': { kind: 'code', lang: 'bash', label: 'Dockerfile' },
        'podfile': { kind: 'code', lang: 'ruby', label: 'Ruby' },
        'gemfile': { kind: 'code', lang: 'ruby', label: 'Ruby' },
        'rakefile': { kind: 'code', lang: 'ruby', label: 'Ruby' },
        'vagrantfile': { kind: 'code', lang: 'ruby', label: 'Ruby' },
        'cmakelists.txt': { kind: 'code', lang: 'makefile', label: 'CMake' },
        'license': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        'readme': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        'changelog': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        'authors': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        'notice': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        'hosts': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        '.env': { kind: 'code', lang: 'ini', label: 'Env' },
        '.gitignore': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        '.gitattributes': { kind: 'text', lang: 'plaintext', label: '纯文本' },
        '.editorconfig': { kind: 'code', lang: 'ini', label: 'INI' },
        '.npmrc': { kind: 'code', lang: 'ini', label: 'INI' },
        '.zshrc': { kind: 'code', lang: 'bash', label: 'Shell' },
        '.bashrc': { kind: 'code', lang: 'bash', label: 'Shell' },
        '.bash_profile': { kind: 'code', lang: 'bash', label: 'Shell' },
        '.zprofile': { kind: 'code', lang: 'bash', label: 'Shell' },
        '.profile': { kind: 'code', lang: 'bash', label: 'Shell' }
    };

    const LANG_LABELS = {
        javascript: 'JavaScript',
        typescript: 'TypeScript',
        json: 'JSON',
        python: 'Python',
        bash: 'Shell',
        shell: 'Shell',
        css: 'CSS',
        scss: 'SCSS',
        less: 'Less',
        xml: 'HTML / XML',
        yaml: 'YAML',
        ini: 'Config',
        sql: 'SQL',
        swift: 'Swift',
        go: 'Go',
        rust: 'Rust',
        java: 'Java',
        kotlin: 'Kotlin',
        c: 'C',
        cpp: 'C++',
        csharp: 'C#',
        objectivec: 'Objective-C',
        ruby: 'Ruby',
        php: 'PHP',
        lua: 'Lua',
        r: 'R',
        perl: 'Perl',
        graphql: 'GraphQL',
        diff: 'Diff',
        makefile: 'Makefile',
        plaintext: '纯文本'
    };

    // Explicitly blocked binary/media/office/archive formats (strictly NO)
    const BINARY_EXTS = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.icns', '.tif', '.tiff', '.heic', '.psd', '.ai',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pages', '.numbers', '.key', '.odt', '.ods', '.odp', '.rtf', '.epub',
        '.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.zst',
        '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v',
        '.dmg', '.pkg', '.app', '.exe', '.msi', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.wasm', '.asar', '.class', '.jar', '.pyc',
        '.ttf', '.otf', '.woff', '.woff2', '.eot',
        '.sqlite', '.sqlite3', '.db', '.mdb', '.accdb', '.parquet', '.arrow', '.pkl', '.npy', '.npz', '.pt', '.pth', '.onnx', '.safetensors'
    ]);

    function getBaseName(fileNameOrPath) {
        if (!fileNameOrPath) return '';
        const norm = String(fileNameOrPath).replace(/\\/g, '/');
        const idx = norm.lastIndexOf('/');
        return idx >= 0 ? norm.slice(idx + 1) : norm;
    }

    function getExt(fileNameOrPath) {
        const base = getBaseName(fileNameOrPath).toLowerCase();
        if (!base) return '';
        if (base.startsWith('.') && base.indexOf('.', 1) === -1) {
            return base;
        }
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(dot) : '';
    }

    function isKnownBinary(fileNameOrPath) {
        const ext = getExt(fileNameOrPath);
        return Boolean(ext && BINARY_EXTS.has(ext));
    }

    /**
     * Classify a filename/path into { kind: 'markdown'|'code'|'csv'|'tsv'|'text', lang, label, ext }
     */
    function classifyFile(fileNameOrPath) {
        if (!fileNameOrPath) {
            return { kind: 'markdown', lang: 'markdown', label: 'Markdown', ext: '.md' };
        }
        const base = getBaseName(fileNameOrPath).toLowerCase();
        const ext = getExt(fileNameOrPath);

        if (SPECIAL_FILENAMES[base]) {
            return { ...SPECIAL_FILENAMES[base], ext };
        }
        if (base.startsWith('.env.')) {
            return { kind: 'code', lang: 'ini', label: 'Env', ext };
        }
        if (MARKDOWN_EXTS.has(ext)) {
            return { kind: 'markdown', lang: 'markdown', label: 'Markdown', ext };
        }
        if (ext === '.csv') {
            return { kind: 'csv', lang: 'csv', label: 'CSV 表格', ext };
        }
        if (ext === '.tsv') {
            return { kind: 'tsv', lang: 'tsv', label: 'TSV 表格', ext };
        }
        if (CODE_EXT_TO_LANG[ext]) {
            const lang = CODE_EXT_TO_LANG[ext];
            const label = ext === '.html' || ext === '.htm' ? 'HTML'
                : ext === '.xml' || ext === '.plist' ? 'XML'
                : ext === '.svg' ? 'SVG'
                : ext === '.toml' ? 'TOML'
                : ext === '.vue' ? 'Vue'
                : ext === '.svelte' ? 'Svelte'
                : (LANG_LABELS[lang] || lang.toUpperCase());
            return { kind: 'code', lang, label, ext };
        }
        if (PLAIN_TEXT_EXTS.has(ext) || !ext) {
            const label = ext === '.log' ? '日志' : '纯文本';
            return { kind: 'text', lang: 'plaintext', label, ext };
        }
        // Unknown extension: treat as plain text unless blocked by binary guard
        return { kind: 'text', lang: 'plaintext', label: ext.replace(/^\./, '').toUpperCase() || '纯文本', ext };
    }

    /**
     * Check whether a file should be accepted by file picker / drag-drop / file tree / quick-open
     */
    function isSupportedTextFile(fileNameOrPath) {
        if (!fileNameOrPath) return false;
        const base = getBaseName(fileNameOrPath).toLowerCase();
        if (!base || base === '.ds_store' || base === 'thumbs.db') return false;
        if (isKnownBinary(base)) return false;
        const ext = getExt(base);
        if (SPECIAL_FILENAMES[base] || base.startsWith('.env.')) return true;
        if (MARKDOWN_EXTS.has(ext) || PLAIN_TEXT_EXTS.has(ext) || CSV_EXTS.has(ext) || Boolean(CODE_EXT_TO_LANG[ext])) {
            return true;
        }
        return false;
    }

    /**
     * Fast binary content detector on raw Buffer / Uint8Array (checks first 8KB for NUL bytes or excessive control chars)
     */
    function isBinaryBuffer(buf) {
        if (!buf || buf.length === 0) return false;
        const len = Math.min(buf.length, 8192);
        let suspicious = 0;
        for (let i = 0; i < len; i++) {
            const byte = buf[i];
            if (byte === 0) return true; // NUL byte is a definitive binary indicator
            // Non-whitespace ASCII control characters (excluding \t=9, \n=10, \r=13, \f=12, ESC=27)
            if (byte < 9 || (byte > 13 && byte < 27) || (byte > 27 && byte < 32)) {
                suspicious++;
            }
        }
        return (suspicious / len) > 0.1;
    }

    /**
     * Fast binary detector on decoded string (renderer FileReader fallback)
     */
    function isBinaryString(str) {
        if (!str) return false;
        const len = Math.min(str.length, 8192);
        for (let i = 0; i < len; i++) {
            if (str.charCodeAt(i) === 0) return true;
        }
        return false;
    }

    function getAllSupportedExtensions() {
        const list = [
            ...MARKDOWN_EXTS,
            ...PLAIN_TEXT_EXTS,
            ...CSV_EXTS,
            ...Object.keys(CODE_EXT_TO_LANG)
        ];
        return Array.from(new Set(list)).map(e => e.replace(/^\./, ''));
    }

    return {
        MARKDOWN_EXTS,
        PLAIN_TEXT_EXTS,
        CSV_EXTS,
        CODE_EXT_TO_LANG,
        BINARY_EXTS,
        classifyFile,
        isKnownBinary,
        isSupportedTextFile,
        isBinaryBuffer,
        isBinaryString,
        getAllSupportedExtensions
    };
}));
