# HearTerm

跨平台 SSH 客户端，支持终端、SFTP 文件管理、分组、拖拽上传。

## 功能

| 模块 | 特性 |
|------|------|
| 终端 | 多 Tab、xterm 256 色、自适应分屏、滚动缓冲区 10000 行 |
| 文件管理 | 树状展开、Tab 补全路径、多选批量下载删除、目录递归传输 |
| 拖拽上传 | 从 Finder 拖文件到面板即上传，确认弹窗可改目标路径 |
| 分组 | 新建/重命名/删除分组，点击 ↗ 移动连接到其他分组 |
| 安全 | AES-256-GCM 本地加密存储密码，派生密钥 SHA-256(master, connId) |
| 导入导出 | JSON 明文密码导出，导入时本地重加密，跨机器迁移 |
| 窗口 | 无边框、自定义红绿灯按钮、侧栏+终端+文件三分屏拖拽 |

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Tauri v2 |
| 前端 | React 18 + TypeScript + Vite 6 + Tailwind CSS 3 |
| 终端 | xterm.js 5 |
| 状态 | Zustand 5 |
| SSH | russh 0.45 + russh-sftp 2.0 |
| 存储 | rusqlite 0.31 (bundled SQLite) |
| 加密 | aes-gcm + sha2 |

## 开发

```bash
npm install
npm run tauri dev    # 开发
npm run tauri build  # 构建
```

## 项目结构

```
├── src/                     # React 前端
│   ├── App.tsx
│   ├── components/
│   │   ├── terminal/        # 终端面板
│   │   ├── files/           # 文件浏览器 + 传输队列
│   │   ├── sidebar/         # 分组连接列表
│   │   ├── dialogs/         # 连接对话框
│   │   ├── host/            # 主机列表
│   │   └── ui/              # 通用组件
│   ├── stores/              # Zustand
│   └── lib/                 # 工具函数
├── src-tauri/               # Rust 后端
│   └── src/
│       ├── ssh/             # SSH 会话 + SFTP 客户端
│       ├── transfer/        # 传输引擎（分块 + 目录递归）
│       ├── storage/         # SQLite + 加密
│       └── commands/        # Tauri 命令
└── src-tauri/capabilities/  # 权限配置
```

## 许可

MIT
