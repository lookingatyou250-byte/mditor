# mditor 3.0 开发继续 Prompt

## 项目概述
mditor 是一个基于 Electron 的极简 Markdown 编辑器，灵感来自 Typora 和 Obsidian。

- **仓库**: https://github.com/lookingatyou250-byte/mditor
- **当前版本**: 3.0.0
- **项目路径**: D:\claude\mditor

## 技术栈
- Electron 28.3.3
- CodeMirror 6 (编辑器)
- marked.js (Markdown 解析)
- DOMPurify (HTML 过滤)
- NSIS (Windows 安装器)

## 关键文件
- `main.js` - Electron 主进程
- `preload.js` - IPC 桥接
- `js/app.js` - 渲染进程主逻辑
- `js/modules/editor.src.js` - CodeMirror 编辑器封装（需 `npm run bundle:editor` 打包）
- `js/modules/parser.js` - Markdown 解析器
- `js/core/state.js` - 状态管理
- `css/components.css` - UI 组件样式
- `css/markdown.css` - Markdown 渲染样式
- `build/installer.nsh` - NSIS 安装脚本

## PRD 3.0 已完成功能
- Settings 面板（字号调整、检查更新）
- 状态栏重设计（左：字数 / 中：mditor→官网 / 右：模式）
- 文件名交互（未定位置→另存为 / 已定位置→重命名 / ▾下拉菜单）
- // 命令菜单（底部「查看全部」展开分组，支持 ←→ 键盘导航）
- 幽灵提示（空文档显示「输入 // 插入格式...」）
- 右键新建（Windows 注册「新建 → Markdown 文档」带图标）
- 主题继承（跨窗口 localStorage 同步）
- 欢迎页（仅无文件参数启动时显示）
- 文档图标（mditor 文字样式）

## 刚修复的 Bug
1. **双击文件打开显示欢迎页** - 原因是 `process.argv` 包含 `.`（当前目录），`args.find()` 错误匹配。修复：使用 `stat.isFile()` 确保只匹配文件。
2. **有序列表序号不显示** - DOMPurify 过滤了 `start` 属性。修复：添加到 ALLOWED_ATTR。
3. **跨窗口主题不同步** - 添加了 `storage` 事件监听器同步主题。

## 待实现功能：Highlight 高亮

### 需求（方案 B）
- `Ctrl+H` 选中文本后高亮
- 高亮后选区上方浮现 5 个颜色小圆点（2秒后自动消失）
- 点击圆点可切换颜色，不点则使用默认/上次颜色
- 5 种颜色：黄、绿、蓝、粉、橙
- 右键菜单也可触发高亮

### 技术实现建议
1. **Markdown 语法**: 使用 `==text==` 表示高亮（marked.js 需配置）
2. **颜色扩展**: 可用 `==yellow::text==` 或 HTML `<mark class="hl-yellow">text</mark>`
3. **浮动面板**: 创建绝对定位的颜色选择器，基于选区位置显示
4. **状态保存**: localStorage 记住上次使用的颜色

### 相关代码位置
- 快捷键绑定: `js/app.js` 的 `_bindKeyboardShortcuts()`
- 斜杠命令参考: `js/app.js` 的 `slashCommandGroups`
- 编辑器操作: `js/modules/editor.src.js` 的 `insertSyntax()`
- Markdown 渲染: `js/modules/parser.js` 的 `_configureMarked()`

## 构建命令
```bash
cd D:/claude/mditor
npm run bundle:editor  # 打包 CodeMirror 编辑器
npm start              # 开发运行
npm run build          # 打包安装程序
```

## Git 操作
```bash
git add -A && git commit -m "描述" && git push origin main
gh release delete v3.0.0 -y  # 删除旧 release
gh release create v3.0.0 --title "mditor v3.0.0" --notes "..." "dist/mditor Setup 3.0.0.exe"
```

## 用户偏好
- 极简、乔布斯风格
- 不要 emoji（除非用户要求）
- 中文界面
- 键盘优先交互
