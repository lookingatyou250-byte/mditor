# 选中文字自动浮现高亮功能

## 功能概述

实现了 Jobs 式的极简设计理念：用户在阅读模式下选中文字后，会自动浮现一个优雅的高亮工具条，无需记住快捷键，点击即可高亮。

## 核心特性

### 1. 阅读模式：自动浮现

**触发条件**
- 只在阅读模式下生效（编辑模式不会自动浮现）
- 用户在内容区选中文字后，延迟 200ms 自动显示工具条
- 工具条定位在选区上方居中位置

**交互流程**
1. 用户选中文字（mouseup 事件）
2. 延迟 200ms 检测选区（避免误触）
3. 显示高亮工具条（平滑动画）
4. 用户点击颜色立即应用高亮
5. 点击其他地方或选区消失时，工具条自动隐藏

**自动隐藏**
- 点击工具条外的任何地方
- 清除文字选择
- 应用高亮后 500ms
- 工具条显示 2 秒后无操作（悬停时暂停计时）

### 2. 编辑模式：保持 Ctrl+H

**触发条件**
- 选中文字后按 Ctrl+H
- 自动应用 `==文本==` 高亮语法
- 显示颜色选择器
- 支持键盘方向键切换颜色（左右箭头）

**键盘导航**（仅编辑模式）
- 左箭头：切换到上一个颜色
- 右箭头：切换到下一个颜色
- Enter：确认颜色并关闭
- Esc：关闭选择器

### 3. UI 设计

**工具条样式**
- 极简圆角设计（border-radius: 20px）
- 5 个预设颜色点 + 1 个加号按钮
- 浮动阴影效果（box-shadow）
- 半透明背景（backdrop-filter）

**动画效果**
- 浮现：淡入 + 上滑 + 缩放（0.15s ease-out）
  ```css
  transform: translateY(8px) scale(0.95) → translateY(0) scale(1)
  opacity: 0 → 1
  ```
- 消失：淡出 + 下移（0.2s ease-out）
  ```css
  transform: translateY(0) → translateY(-4px)
  opacity: 1 → 0
  ```

**颜色方案**（Tailwind-inspired）
- 琥珀（amber）: rgba(251, 191, 36, 0.35)
- 翡翠（emerald）: rgba(52, 211, 153, 0.30)
- 天蓝（sky）: rgba(56, 189, 248, 0.30)
- 玫瑰（rose）: rgba(251, 113, 133, 0.30)
- 紫罗兰（violet）: rgba(167, 139, 250, 0.35)

### 4. 智能定位

**位置计算**
- 默认：选区上方居中，距离选区 40px
- 左边界：距离左边缘至少 10px
- 右边界：距离右边缘至少 10px
- 上边界：如果上方放不下，显示在选区下方（距离 8px）

**滚动适配**
- 自动处理页面滚动偏移（window.scrollY）
- 支持动态内容区域

## 实现细节

### 核心方法

**D:\claude\mditor\js\app.js**

1. `_handleReadModeSelection()` (1672-1695 行)
   - 处理阅读模式下的文字选择
   - 检测选区有效性
   - 显示高亮工具条

2. `_setHighlightColor(color)` (1531-1566 行)
   - 设置高亮颜色
   - 阅读模式：自动应用高亮到当前选区
   - 保存颜色偏好到 localStorage

3. `_bindHighlightPickerKeyboard()` (1486-1528 行)
   - 绑定键盘快捷键
   - **重要修复**：只在编辑模式下响应，避免影响阅读模式的方向键导航

4. `_showHighlightPickerForReadMode(range)` (1796-1849 行)
   - 显示颜色选择器
   - 智能定位算法
   - 边界检测

### 事件绑定

**D:\claude\mditor\js\app.js** (337-363 行)

```javascript
// 阅读模式：选中文字自动浮现高亮工具条
this.elements.content?.addEventListener('mouseup', (e) => {
    if (this.isEditMode) return;

    if (this._selectionTimeout) {
        clearTimeout(this._selectionTimeout);
    }

    this._selectionTimeout = setTimeout(() => {
        this._handleReadModeSelection();
    }, 200);
});

// 点击其他地方时隐藏工具条
document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.highlight-picker') ||
        e.target.closest('.color-add-popup')) {
        return;
    }
    if (this.highlightPickerVisible && !this.isEditMode) {
        this._hideHighlightPicker();
    }
});
```

### CSS 动画

**D:\claude\mditor\css\components.css** (1065-1089 行)

```css
@keyframes highlightPickerIn {
    from {
        opacity: 0;
        transform: translateY(8px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes highlightPickerOut {
    from {
        opacity: 1;
        transform: translateY(0);
    }
    to {
        opacity: 0;
        transform: translateY(-4px);
    }
}
```

## 已修复的问题

### 1. 键盘方向键导航冲突
**问题**：阅读模式下使用方向键浏览页面时，被高亮选择器拦截
**解决**：修改 `_bindHighlightPickerKeyboard()`，只在编辑模式下响应键盘事件

### 2. 工具条意外显示
**问题**：编辑模式下也会浮现工具条
**解决**：在 `mouseup` 事件中添加 `if (this.isEditMode) return` 检查

### 3. 选区消失后工具条残留
**问题**：选区消失后工具条仍然显示
**解决**：在 `_handleReadModeSelection()` 中检测空选区时隐藏工具条

## 测试建议

### 阅读模式测试
1. 打开 `test-highlight.md`
2. 选中任意文字，等待 200ms
3. 验证工具条浮现动画
4. 点击颜色，验证高亮应用
5. 点击其他地方，验证工具条消失
6. 使用方向键浏览页面，验证无冲突

### 编辑模式测试
1. 切换到编辑模式（Ctrl+E）
2. 选中文字，验证不会自动浮现
3. 按 Ctrl+H，验证显示工具条
4. 使用左右箭头切换颜色
5. 按 Enter 确认，按 Esc 取消

### 边界测试
- 选中靠近窗口顶部的文字（工具条应显示在下方）
- 选中靠近左右边缘的文字（工具条应居中且不溢出）
- 选中非常短的文字（单个字）
- 选中跨多行的长文字

## 用户体验改进

1. **延迟响应**：200ms 延迟避免了快速拖拽时的误触
2. **自动应用**：点击颜色立即高亮，无需二次确认
3. **智能定位**：根据选区位置和边界自动调整工具条位置
4. **优雅动画**：平滑的淡入淡出动画，符合现代 UI 标准
5. **键盘友好**：编辑模式下支持键盘导航，阅读模式下不干扰方向键

## 文件变更

### 修改的文件
1. `D:\claude\mditor\js\app.js`
   - 添加 `_handleReadModeSelection()` 方法
   - 修改 `_setHighlightColor()` 方法
   - 修改 `_bindHighlightPickerKeyboard()` 方法
   - 添加事件监听器
   - 初始化 `_selectionTimeout` 属性

2. `D:\claude\mditor\css\components.css`
   - 优化 `highlightPickerIn` 动画

### 新增的文件
1. `D:\claude\mditor\test-highlight.md` - 测试文档
2. `D:\claude\mditor\HIGHLIGHT_FEATURE.md` - 本文档

## 未来可能的优化

1. **移动端支持**：添加触摸事件支持（touchend）
2. **自定义延迟**：允许用户在设置中调整浮现延迟时间
3. **快捷键提示**：首次使用时显示简短的引导提示
4. **颜色管理**：支持删除自定义颜色
5. **高亮历史**：支持 Ctrl+Z 撤销高亮
