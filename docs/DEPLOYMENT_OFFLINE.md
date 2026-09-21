# 替抗蓟化离线竞赛版：Windows 部署方案

> 正式比赛现改用“Windows 本地 Web 版”为第一选择，详见 `WINDOWS_WEB_DEPLOYMENT.md`。本文件中的 Electron 安装版和免安装版降为备用方案。

## 1. 交付目标

目标设备为 Windows 10/11 64 位（x64）。比赛现场即使完全断网，仍可使用：

- 新版指挥舱与经典可视化；
- 本地业务数据、检测、评价、报告、追溯与审计；
- 只依据当前批次证据的确定性问答；
- 麦克风中文语音输入；
- 联网 MiMo、断网电脑自带中文声音的自动切换输出；
- 随真实声音能量变化的数字人口型；
- 文字输入与快捷问题兜底。

所有业务数据和判定请求只访问 `127.0.0.1`。MiMo 仅用于联网时的语音合成；不可用时浏览器自动调用电脑自带声音，不影响业务结论。

## 2. Windows 完整交付包

本地 `release/` 已生成：

- `替抗蓟化离线竞赛版 Setup 1.0.0.exe`：标准安装版，按当前用户安装，可创建桌面快捷方式；
- `替抗蓟化离线竞赛版 1.0.0.exe`：免安装版，没有管理员权限或安装版异常时直接双击。

旧 Electron 文件仅作历史备用；正式交付请使用 `WINDOWS_WEB_DEPLOYMENT.md` 中的 Windows 本地 Web 通用包。该包内置 x64/ARM64 运行时、SenseVoice 识别模型、SQLite 数据库能力和全部页面资源，不再携带 ZipVoice/Matcha 合成模型。

当前包未使用商业 Windows 代码签名证书，首次运行可能出现 SmartScreen。比赛前应在主机和备用机上各运行一次，避免现场首次确认。

## 3. 比赛电脑要求

- Windows 11 x64 优先，也支持 Windows 10 x64；
- 近五年 Intel Core i5 / AMD Ryzen 5 或更高；
- 16GB 内存，至少 5GB 可用磁盘；
- USB 麦克风或电脑内置麦克风；
- 现场音响或电脑扬声器；
- 推荐 1920×1080、系统缩放 100%；
- 无需独立显卡。

## 4. 正式部署步骤

1. 把两个 `.exe` 同时复制到主 U 盘和备用 U 盘；
2. 在正式比赛电脑上优先运行 `Setup` 安装版；
3. SmartScreen 若提示“Windows 已保护你的电脑”，点击“更多信息”→“仍要运行”；
4. 启动后允许麦克风权限；
5. 关闭 Wi-Fi、拔掉网线、关闭手机热点和 VPN；
6. 重启应用，说“这批鸡安全吗？”，确认识别文字、女声和嘴型均正常；
7. 再运行一次免安装版，确认其可作为现场兜底；
8. 在备用 Windows 电脑上重复以上步骤。

## 5. Windows 权限与显示设置

- 设置 → 隐私和安全性 → 麦克风：打开“麦克风访问”和“允许桌面应用访问麦克风”；
- 设置 → 系统 → 声音：比赛麦克风设为输入设备，现场音响设为输出设备；
- 设置 → 系统 → 显示：缩放设为 100%，分辨率优先 1920×1080；
- 设置 → 系统 → 电源和电池：选择“最佳性能”，关闭比赛期间自动睡眠；
- 关闭会占用麦克风的会议软件、语音助手和浏览器标签页。

## 6. 从源码重新构建（维护人员使用）

普通比赛电脑无需执行本节。首次准备模型和依赖时需要网络。

### 在 Windows 11 x64 构建

```powershell
npm ci
npm run offline:models
npm run test:all
npm run offline:smoke
npm run desktop:dist:win
npm run offline:verify-win-package
```

### 在 macOS 交叉构建 Windows x64 包

```bash
npm ci
npm run offline:models
npm run desktop:dist:win
npm run offline:verify-win-package
```

项目会自动准备 `sherpa-onnx-win-x64`，不会再尝试把 macOS 原生组件放进 Windows 包。`offline:verify-win-package` 必须显示：

- `ok: true`；
- `platform: Windows x64`；
- `appExecutable: x86-64`；
- SenseVoice 识别模型已打包；
- `networkRequiredAtRuntime: false`。

交叉构建能验证架构与资源完整性，但最终麦克风、扬声器、识别速度和合成速度必须在实际 Windows 比赛电脑上断网验收。

## 7. 数据位置与备份

Windows 桌面版数据通常位于：

```text
%APPDATA%\替抗蓟化离线竞赛版\runtime\tihua.db
```

比赛前关闭应用，再复制 `tihua.db`、`tihua.db-wal`、`tihua.db-shm`（若存在）到备份目录。不要在应用运行中只复制主数据库文件。

## 8. 建议 U 盘结构

```text
比赛交付盘/
├── 01-Windows安装包与免安装版/
├── 02-完整源码与模型/
│   └── tihua-offline-competition/
├── 03-数据库备份/
├── 04-Windows启动与验收说明/
└── 05-现场录屏兜底/
```

源码目录中的 `models/offline/` 必须完整保留。模型未提交到 Git，仅拉取仓库不能获得离线语音模型。

## 9. 安全与隐私

- 麦克风录音只发送到本机回环地址，不上传外网；
- 语音默认不保存在磁盘；
- 问答结论只来自当前平台记录，不让语言模型自行生成业务结论；
- 桌面应用只给本机页面授予麦克风权限；
- 数据库、比赛账号密码和备份盘按内部资料管理。

## 10. 后续增强边界

当前版本以普通 Windows x64/ARM64 CPU 为运行基线，不依赖 CUDA。语音输出由 MiMo 与浏览器系统声音自动切换；GPU 视频数字人只能作为增强层，不能替换当前稳定的业务与识别链路。
