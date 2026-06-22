# SSH 工具

跨平台现代 SSH 客户端，支持终端、SFTP 文件管理、分组、导入导出。

## 功能

### 终端
- 多 Tab 终端，每个连接可开多个 Shell
- xterm.js 256 色，ResizeObserver 自适应分屏拖拽
- 滚动缓冲区 10000 行

### 文件管理
- 树状文件浏览器，点击 ▶ 展开子目录
- 文件多选批量下载/删除
- 支持目录递归下载/上传
- 拖拽上传（Tauri 原生事件，从 Finder 拖文件到面板即可）
- 路径输入框直接跳转目录

### 连接管理
- 分组管理：新建/重命名/删除分组，点击 "↗" 移动到其他分组
- 新建连接（保存 + 保存并连接 + 测试连接）
- 编辑连接可显隐密码

### 安全
- AES-256-GCM 本地加密存储密码（SQLite）
- 密码通过 SHA-256(master_key, connectionId) 推导密钥，不存明文

### 导入导出
- 导出 JSON（含连接信息 + 明文密码）
- 导入时用本机密钥重新加密
- 跨机器迁移：导出 → 拷贝 → 另一台导入

### 窗口
- 无边框窗口，自定义红绿灯窗口按钮
- 分屏布局（左侧连接 → 上终端 → 下文件），分割线可拖拽

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri v2 |
| 前端 | React 18 + TypeScript + Vite 6 + Tailwind CSS 3 |
| 终端 | xterm.js 5 + xterm-addon-fit + xterm-addon-web-links |
| 状态管理 | Zustand 5 |
| SSH | russh 0.45 + russh-sftp 2.0 |
| 数据库 | rusqlite 0.31 (bundled SQLite) |
| 加密 | aes-gcm + sha2 |

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 项目结构

```
├── src/                     # React 前端
│   ├── App.tsx              # 主布局：侧栏 + 终端 + 文件面板
│   ├── components/
│   │   ├── terminal/        # TerminalPanel — xterm.js 终端
│   │   ├── files/           # FilePanel — 树状文件管理 + TransferQueue
│   │   ├── sidebar/         # ConnectionList — 分组连接列表
│   │   ├── dialogs/         # ConnectionDialog — 新建/编辑连接
│   │   ├── host/            # HostList — 主机列表
│   │   └── ui/              # 通用 UI 组件
│   ├── hooks/               # 自定义 hooks
│   ├── stores/              # Zustand 状态
│   └── lib/                 # 工具函数 + Tauri IPC
├── src-tauri/               # Rust 后端
│   └── src/
│       ├── ssh/             # session.rs + sftp.rs
│       ├── transfer/        # engine.rs — 分块上传/下载 + 目录递归
│       ├── storage/         # db.rs + keyring.rs + crypto.rs
│       ├── commands/        # settings / connection / terminal / sftp / transfer
│       └── lib.rs           # 命令注册
└── src-tauri/capabilities/  # Tauri 权限配置
```

## 许可

MIT
