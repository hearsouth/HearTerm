# SSH Tool

轻量、跨平台的现代 SSH 客户端，支持 SFTP 文件传输和断点续传。

## 功能特性

- 🔌 **SSH 终端** — 密码认证 + PTY 交互式 Shell，支持 xterm-256color
- 📁 **SFTP 文件管理** — 远程文件浏览、上传、下载、删除、重命名、新建文件夹
- 🖱️ **拖拽上传** — 拖拽文件到窗口即可上传，实时进度条
- ⏸️ **断点续传** — 传输中断后自动保存状态，支持从断点继续
- 🔐 **凭证安全** — 密码存储于 macOS Keychain / Windows 凭据管理器
- 👁 **密码显隐** — 连接表单支持切换密码可见性
- 🎨 **现代暗色 UI** — 无边框窗口，TailwindCSS 暗色主题
- 💾 **连接管理** — 保存多个服务器配置，一键重连
- 🪶 **极致轻量** — DMG 安装包仅 ~9MB（release），内存占用 ~50MB

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + TailwindCSS + xterm.js + Zustand |
| 后端 | Rust + Tauri v2 + russh（SSH）+ russh-sftp + rusqlite |
| 安全 | macOS Keychain / Windows Credential Manager + AES-256-GCM |

## 安装

### macOS

下载 `SSH-Tool-0.1.0.dmg`，双击打开，拖入 Applications 文件夹。

### Windows

下载 `.msi` 安装包，双击运行。

> Windows 版本通过 GitHub Actions 自动构建，见 CI 配置。

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（热重载）
npm run tauri dev

# 构建发布包
npm run tauri build
```

## 项目结构

```
ssh-tool/
├── src/                      # React 前端
│   ├── App.tsx               # 主布局 + 标签切换
│   ├── components/
│   │   ├── terminal/         # xterm.js 终端面板
│   │   ├── files/            # SFTP 文件浏览器 + 传输队列
│   │   ├── sidebar/          # 连接列表
│   │   └── dialogs/          # 连接对话框
│   └── stores/               # Zustand 状态管理
├── src-tauri/                # Rust 后端
│   └── src/
│       ├── ssh/              # SSH 会话 + SFTP 客户端 + Host Key 校验
│       ├── transfer/         # 分块上传/下载引擎 + 断点续传
│       ├── storage/          # SQLite 数据库 + Keychain 密码存储
│       ├── commands/         # Tauri IPC 命令（12 个）
│       └── main.rs           # 应用入口
└── .github/workflows/        # CI 自动构建（macOS + Windows）
```

## 许可

MIT
