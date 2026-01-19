/**
 * Scrollbar Controller
 * 简单方案：不改 DOM，只通过 CSS 类控制原生滚动条的显示
 * - 鼠标靠近右侧时显示
 * - 滚轮滚动时显示
 * - 其他情况隐藏
 */

const Scrollbar = (() => {
    const HIDE_DELAY = 1000; // 滚动停止后隐藏延迟
    const EDGE_WIDTH = 30;   // 右侧侦测区域宽度

    /**
     * 为元素启用智能滚动条显示
     * @param {HTMLElement} element - 可滚动的元素
     */
    function init(element) {
        if (!element) return;

        let hideTimer = null;

        function show() {
            element.classList.add('scrollbar-visible');
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        }

        function hideDelayed() {
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                element.classList.remove('scrollbar-visible');
            }, HIDE_DELAY);
        }

        // 滚动时显示
        element.addEventListener('scroll', () => {
            show();
            hideDelayed();
        }, { passive: true });

        // 鼠标移动时检测是否在右侧边缘
        element.addEventListener('mousemove', (e) => {
            const rect = element.getBoundingClientRect();
            const distanceFromRight = rect.right - e.clientX;

            if (distanceFromRight <= EDGE_WIDTH) {
                show();
            } else if (!element.classList.contains('scrollbar-visible')) {
                // 不在边缘且未显示，不做处理
            } else {
                // 不在边缘但已显示，延迟隐藏
                hideDelayed();
            }
        }, { passive: true });

        // 鼠标离开时延迟隐藏
        element.addEventListener('mouseleave', () => {
            hideDelayed();
        }, { passive: true });
    }

    /**
     * 初始化内容区域的滚动条
     */
    function initContentScrollbar() {
        const content = document.getElementById('content');
        if (content) {
            init(content);
        }
    }

    /**
     * 初始化编辑器的滚动条
     */
    function initEditorScrollbar() {
        const editorArea = document.getElementById('editor');
        if (editorArea) {
            editorArea.classList.add('scrollbar-visible'); // 编辑器默认显示
            init(editorArea);
        }
    }

    return {
        init,
        initContentScrollbar,
        initEditorScrollbar
    };
})();

window.Scrollbar = Scrollbar;
