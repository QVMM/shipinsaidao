# 替抗蓟化离线竞赛版：部署方案

## 1. 交付目标

比赛现场即使完全断网，仍可使用以下能力：

- 新版指挥舱与经典可视化；
- SQLite 本地业务数据、检测、评价、报告、追溯与审计；
- 基于本批次证据的确定性问答；
- 麦克风语音输入；
- 本地自然中文女声输出；
- 随真实声音能量变化的数字人口型；
- 文字输入与快捷问题兜底。

所有业务请求只访问 `127.0.0.1`。不需要 MiMo、Render、浏览器云语音或现场互联网。

## 2. 软件组成

| 模块 | 本地实现 | 作用 |
| --- | --- | --- |
| 页面与接口 | Vite + Fastify | 同一个本机进程提供页面和 API |
| 数据 | SQLite | 数据保存在比赛电脑本地 |
| 语音识别 | SenseVoice INT8 | 把 16kHz 麦克风 PCM 转成中文文字 |
| 自然女声 | ZipVoice INT8 + 24kHz Vocos | 默认女声音色为 `Emilia` |
| 女声兜底 | Matcha Baker + 22kHz Vocos | ZipVoice 缺失时仍可本地播报 |
| 数字人 | 固定人像 + 两级嘴型 + 音频能量驱动 | 避免整张脸来回切换和嘴型硬跳 |
| 桌面运行 | Electron | 双击启动、麦克风授权、全屏展示 |

当前模型目录约 600MB；完整项目连同依赖和桌面运行时会更大，比赛 U 盘建议预留至少 4GB。

## 3. 首次部署（需要一次网络）

### macOS / Apple Silicon

在项目根目录执行：

```bash
npm ci
npm run offline:models
npm run build
npm run offline:check
npm run offline:smoke
```

`offline:check` 必须显示：

- `ok: true`
- `asr: true`
- `tts: true`
- `voice: 本地自然女声·Emilia`

`offline:smoke` 会真正合成一句女声，再把该音频交给本地识别。`ok: true` 且 `recognized` 正确，才算语音链路部署成功。

### Windows 11 x64

必须在 Windows 目标机或 Windows 构建机中执行同样的五条命令。不要把 macOS 的 `node_modules` 直接复制到 Windows，因为 SQLite 和 sherpa-onnx 都包含与操作系统相关的本地组件。

推荐环境：Node.js 22 LTS、Windows 11 x64、16GB 以上内存、20GB 以上可用磁盘。

## 4. 生成免命令行桌面包

### macOS

```bash
npm run desktop:dist:mac
```

产物在 `release/`。将 `.dmg` 和 `.zip` 一并复制到比赛 U 盘：`.dmg` 用于正常安装，`.zip` 用于安装受限时应急解压运行。

首次打开若 macOS 拦截未签名应用：系统设置 → 隐私与安全性 → 仍要打开。麦克风权限选择“允许”。

### Windows

在 Windows 构建机执行：

```powershell
npm run build
npx electron-builder --win nsis portable
```

同时携带安装版和 portable 版。现场没有管理员权限时直接使用 portable 版。

## 5. 数据位置与备份

- 源码方式运行：`data/tihua.db`
- Electron 桌面版：系统用户数据目录下的 `runtime/tihua.db`

macOS 桌面版通常位于：

```text
~/Library/Application Support/替抗蓟化离线竞赛版/runtime/tihua.db
```

Windows 通常位于：

```text
%APPDATA%\替抗蓟化离线竞赛版\runtime\tihua.db
```

比赛前关闭应用，再复制 `tihua.db`、`tihua.db-wal`、`tihua.db-shm`（若存在）到备份目录。不要在应用运行中只复制主数据库文件。

## 6. 建议交付结构

```text
比赛交付盘/
├── 01-Mac安装包/
├── 02-Windows安装包/
├── 03-完整源码与模型/
│   └── tihua-offline-competition/
├── 04-数据库备份/
├── 05-启动说明.pdf
└── 06-现场录屏兜底/
```

源码目录中的 `models/offline/` 必须完整保留。模型未提交到 Git，因此只拉取仓库并不能获得离线语音模型。

## 7. 安全与隐私

- 麦克风录音只发送到本机回环地址，不上传外网；
- 语音默认不保存在磁盘；
- 问答结论只来自当前平台记录，不让语言模型自行生成业务结论；
- Electron 仅给本机页面授予麦克风权限；
- 数据库、比赛账号密码和备份盘按内部资料管理。

## 8. 可选增强

如果比赛电脑有 NVIDIA 独显，可另做 GPU 数字人视频方案；但它不应替换当前稳定链路。当前版本对 Apple M4 和普通 Windows CPU 更稳，现场依赖更少。若后续有授权的真人数字人形象与录音，可替换 ZipVoice 参考音频和头像素材，无需重写业务系统。
