# 标题高亮 Bug 修复说明

## 问题描述

当文本中包含大标题（如 h1, h2 等）时，无法高亮。例如这段内容无法高亮：

```
功能特色
无边框窗口 - 沉浸式写作体验
实时自动保存 - 2秒无操作自动保存
聚焦模式 - 点击右上角靶心图标，专注当前段落
暗色主题 - 点击右上角月亮/太阳图标切换
```

## 修复内容

### 1. 改进 `_handleReadModeSelection()` 函数（第 2089-2129 行）

**问题：**
原来的代码只检查 `contentArea.contains(range.commonAncestorContainer)`，当选择跨越多个块级元素（如从 h2 到多个 p 元素）时，可能存在边界情况。

**修复：**
```javascript
// 修复前
if (!contentArea || !contentArea.contains(range.commonAncestorContainer)) {
    return;
}

// 修复后
const startInContent = contentArea.contains(range.startContainer);
const endInContent = contentArea.contains(range.endContainer);
const commonInContent = contentArea.contains(range.commonAncestorContainer) ||
                        range.commonAncestorContainer === contentArea;

if (!startInContent || !endInContent || !commonInContent) {
    console.log('选区不在内容区域内', { startInContent, endInContent, commonInContent });
    return;
}
```

**改进点：**
- 显式检查选区的起点和终点是否都在内容区内
- 添加了 `|| range.commonAncestorContainer === contentArea` 确保当共同祖先就是内容区本身时也能通过检查
- 添加了诊断日志，方便调试

### 2. 改进 `_applyReadModeHighlight()` 函数（第 2150-2179 行）

**问题：**
选区检查不够完善，对跨元素选择（特别是包含标题的选择）处理不够健壮。

**修复：**
```javascript
// 修复前
if (!contentArea || !contentArea.contains(range.commonAncestorContainer)) {
    console.warn('选区不在内容区域内');
    return;
}

// 修复后
const startInContent = contentArea.contains(range.startContainer);
const endInContent = contentArea.contains(range.endContainer);
const commonInContent = contentArea.contains(range.commonAncestorContainer) ||
                        range.commonAncestorContainer === contentArea;

if (!startInContent || !endInContent || !commonInContent) {
    console.warn('选区不在内容区域内', {
        startInContent,
        endInContent,
        commonInContent,
        commonAncestor: range.commonAncestorContainer.nodeName
    });
    return;
}
```

**改进点：**
- 使用与 `_handleReadModeSelection()` 相同的完善检查逻辑
- 添加详细的诊断信息，包括 commonAncestor 的节点名

### 3. 改进 `findTextRange()` 错误日志（第 2320-2329 行）

**问题：**
当无法找到选区文本时，错误信息不够详细，难以诊断问题。

**修复：**
```javascript
// 修复前
if (startIndex === -1) {
    console.warn('无法找到选区文本:', targetText.substring(0, 20));
    return null;
}

// 修复后
if (startIndex === -1) {
    console.warn('无法找到选区文本:', targetText.substring(0, 50));
    console.warn('父元素:', parent.nodeName, '全文前100字符:', fullText.substring(0, 100));
    console.warn('目标文本长度:', targetText.length, '父元素文本长度:', fullText.length);
    return null;
}
```

**改进点：**
- 增加显示的文本长度（从 20 到 50 字符）
- 显示父元素节点名和部分内容
- 显示文本长度对比，便于发现空格/换行等问题

### 4. 改进高亮应用的错误处理（第 2367-2396 行）

**问题：**
`surroundContents` 和 `extractContents` 失败时没有足够的日志，难以诊断。

**修复：**
```javascript
// 修复前
try {
    newRange.surroundContents(mark);
} catch (e) {
    const fragment = newRange.extractContents();
    mark.appendChild(fragment);
    newRange.insertNode(mark);
}

// 修复后
try {
    newRange.surroundContents(mark);
    console.log('高亮应用成功（surroundContents）');
} catch (e) {
    console.log('surroundContents 失败，使用 extractContents:', e.message);
    try {
        const fragment = newRange.extractContents();
        mark.appendChild(fragment);
        newRange.insertNode(mark);
        console.log('高亮应用成功（extractContents）');
    } catch (e2) {
        console.error('extractContents 也失败:', e2.message);
        throw e2;
    }
}
```

**改进点：**
- 添加成功和失败的日志
- 对 extractContents 也添加 try-catch，避免静默失败
- 记录具体的错误信息

### 5. 改进 `_showHighlightTrigger()` 函数（第 2442-2456 行）

**问题：**
当无法获取选区位置时静默返回，用户不知道为什么触发图标不显示。

**修复：**
```javascript
// 修复前
const rect = range.getBoundingClientRect();
if (!rect || rect.width === 0) return;

// 修复后
const rect = range.getBoundingClientRect();
if (!rect || rect.width === 0) {
    console.log('无法获取选区位置，rect:', rect);
    return;
}
```

**改进点：**
- 添加日志说明为什么触发图标没有显示

## 测试工具

创建了三个测试文件帮助诊断和验证修复：

1. **test_contains.html** - 测试 `element.contains()` 方法的行为
2. **test_heading_highlight.html** - 测试标题高亮的基本功能
3. **test_heading_selection_debug.html** - 完整的选区诊断工具（推荐使用）

### 使用诊断工具

打开 `test_heading_selection_debug.html`：

1. 在左侧蓝色区域选中包含标题的文本
2. 右侧会实时显示选区信息和检查结果
3. 点击"运行完整诊断"查看详细的技术信息
4. 点击"测试应用高亮"验证高亮功能是否正常

所有检查项都应该显示"✓ 通过"。如果有"✗ 失败"，可以根据提示进一步诊断。

## 可能的根本原因

经过分析，标题高亮失败可能有以下原因：

### 1. 选区检查过于严格
当选择跨越 h2 和多个 p 元素时，`range.commonAncestorContainer` 会是 `#content` 元素本身。虽然根据 DOM 规范 `element.contains(element)` 应该返回 `true`，但在某些边界情况下可能需要显式处理。

### 2. 文本匹配失败
`findTextRange()` 使用 `textContent.indexOf()` 查找文本。跨元素选择时，可能存在：
- 选区文本包含的空格/换行与 DOM 中的不一致
- 选区包含了不可见字符
- 选区部分在内容区之外

### 3. Range API 限制
`surroundContents()` 在选区部分选中某个元素时会抛出异常。虽然代码已经有 fallback 到 `extractContents()`，但可能在某些情况下都会失败。

## 如何验证修复

1. 打开 mditor 应用
2. 打开开发者工具控制台（F12）
3. 尝试高亮包含标题的文本
4. 查看控制台输出的日志：
   - 如果看到"选区不在内容区域内"，说明选区检查失败
   - 如果看到"无法找到选区文本"，说明文本匹配失败
   - 如果看到"surroundContents 失败"但之后有"extractContents 成功"，说明 fallback 生效
   - 如果看到"高亮应用成功"，说明功能正常

## 注意事项

这些修复主要是：
1. **增强了边界情况处理**：对跨元素选择（包括标题）的支持更健壮
2. **添加了详细日志**：方便诊断具体哪个环节出了问题
3. **改进了错误处理**：避免静默失败

如果问题仍然存在，使用诊断工具和控制台日志可以快速定位问题根源。

## 相关文件

- `D:\claude\mditor\js\app.js` - 主要修复文件
- `D:\claude\mditor\test_heading_selection_debug.html` - 诊断工具（推荐）
- `D:\claude\mditor\test_heading_highlight.html` - 基础测试
- `D:\claude\mditor\test_contains.html` - contains() 方法测试
