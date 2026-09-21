# 替抗蓟化 减抗鸡肉全链条质控与溯源平台

内部可上线的全栈：工作人员登录后改自己负责的一段，写进 SQLite；买家扫码不用登录。

第一次登录应立刻看懂：这是一批减抗鸡肉从养殖到上桌的安全与追溯；这批能不能上桌；下一步按哪个按钮。

产品只写替抗蓟化。药材只写大蓟、大蓟粗提物。批次蓟化-2026-0812。不要写蓬、蒨。

## 怎么跑

```
npm install
npm run seed
npm run build
npm start
```

浏览器打开 http://127.0.0.1:4173/

### 本地离线部署

本目录是独立的比赛离线版。完整部署与现场操作分别见：

- [离线部署方案](docs/DEPLOYMENT_OFFLINE.md)
- [启动与应急方案](docs/STARTUP_OFFLINE.md)
- [比赛验收清单](docs/COMPETITION_ACCEPTANCE.md)

交付电脑小白时，使用 `release/替抗蓟化-Windows本地Web版-1.0.6-universal.zip`。同一个包会自动适配 Intel/AMD x64 与 Qualcomm/Windows on ARM 电脑。用户只需先“全部解压”，再双击排在最上方的 `00-首次使用-安装并启动.bat`；程序会等到本地网页真正可访问后才打开浏览器，本地女声在独立线程中准备，不会阻塞网页。之后每次直接使用自动创建的“打开替抗蓟化网页”桌面图标。它会打开带地址栏的普通浏览器窗口，不是桌面应用；对方电脑不需要安装 Node.js、Python 或数据库。

首次准备：

```
npm ci
npm run offline:models
npm run build
npm run offline:check
npm run offline:smoke
```

桌面运行：

```
npm run desktop
```

也可双击 `bin/start-offline-mac.command` 或 `bin/start-offline-windows.bat`。Electron 桌面版自动选空闲端口，避免固定 4173 被占用。

浏览器应急模式：`npm run offline`，然后打开 http://127.0.0.1:4173/?offline=1#/stage 。

离线模式下，登录、SQLite、检测判定、报告、追溯码、公开扫码、两套大屏、本地证据问答、SenseVoice 语音识别和 ZipVoice 自然女声全部在本机运行。默认声音为 `本地自然女声·Emilia`，Matcha Baker 为本地兜底；不会调用浏览器声音。

开发（前端热更新 + API）：

```
npm run seed
npm run dev
```

- 页面：http://127.0.0.1:5173/（Vite 把 /api 代理到 8787）
- API：http://127.0.0.1:8787/api

其它：

```
npm run lint
npm run build
```

`npm start` 一个进程同时提供 API 和打好的前端。先 `npm run build`。空库会自动灌种子；`npm run seed` 会把账号密码、焦点 0812 与 11 批体系鸡重置回默认。

复制 `.env.example` 为 `.env`。至少改 `SESSION_SECRET`。不要把 `.env` 和 `*.db` 提交进 git。

### DJTK 智控助手（完全离线）

指挥舱 `#/stage` 的数字人使用本地证据与固定规则回答，不接通用云端大模型。麦克风音频只发往 `127.0.0.1`，由 SenseVoice 识别；回答由 ZipVoice 本地自然女声播报。嘴型读取实际播放音频能量，在闭合、轻启、张开三档间平滑变化，人物头部和眼睛保持固定，避免整脸切换。

接口：`POST /api/djtk/transcribe`（PCM16）、`POST /api/djtk/ask`、`POST /api/djtk/tts`、`GET /api/djtk/status`。状态接口会明确返回 `networkRequired:false`。

## 工作账号

首次部署后必须立即修改各工作账号的初始口令，并妥善保管本机数据库与 `.env`。现有开发数据库中的初始口令仅用于本机初始化，不得沿用到交付环境。

| 用户名 | 角色 | 能写什么 |
| --- | --- | --- |
| yangzhi | farm / 智慧养殖 | 养殖档案 + 用药本 |
| kuaijian | screen / 安全检测 | 安全检测结果 |
| pingjia | eval / 质量评价 | 实验室评价 |
| suyuan | trace / 数据溯源 | 与管理员相同：养殖、检测、评价、出报告、出码、新建批次、恢复预填数据 |
| guanli | admin / 管理员 | 全部写入 |

越权写入返回 403，正文是人话，例如：「当前账号（安全检测）不能改养殖档案。」

## 数据流

浏览器不再把 localStorage 当真相。登录后 `GET /api/batches/:batchId` 拉批次；改表单先改内存，约 400ms 后 `PATCH` 落库。出报告 / 出码 / 新建批次 / 恢复预填数据走 POST。刷新后还能看见，因为在 SQLite。

买家页 `#/consumer`、`#/trace/蓟化-2026-0812` 走 `GET /api/public/trace/:batchId`，不用 cookie。

指挥舱看体系，操作台看焦点批次。公开大屏默认进入新版指挥舱；顶部“经典可视化”可切换到保留的 1920×1080 数据大屏，经典版顶部“新版指挥舱”可切回。两套视图共用 `GET /api/public/command` 的实时数据、焦点批次和判定规则，不是两套数据副本。单批仍走 `GET /api/public/stage/:batchId`。墙上是多批次体系，0812 只是焦点。每批一个阶段：养殖中 / 检测中 / 评价中 / 待出证 / 已出码 / 已上市；阳性或炎症偏高进预警。

写操作追加 `audit_logs`，只插不改。工作人员可 `GET /api/audit?batchId=`。

## 权限

- 未登录打开 `/` 或 `#/dashboard` → 登录页。登录后先选择批次，再进入「产品信息」。
- 侧栏显示当前用户，可退出。
- 「恢复预填数据」只给管理员和溯源员。
- 「现场怎么分工」仍是折叠说明，不是入口。
- 消费者 / 扫码页保持公开。

## 目录

```
server/index.js     一个进程：API + dist
server/app.js       路由
server/command.js   公开指挥舱
server/db.js        SQLite 表、种子、组装批次
server/auth.js      哈希口令 + httpOnly 会话 cookie
server/offline-voice.js  SenseVoice + ZipVoice/Matcha 本地语音
src/lib/offline-audio.js 浏览器麦克风采集与 16kHz PCM
desktop/main.js          Electron 桌面壳、动态端口与麦克风权限
models/offline/          本地模型（git 忽略，交付时必须携带）
server/roles.js     角色与 403 文案
server/seed.js      npm run seed
src/                Vite 前端（旅程 IA 未改）
src/store.js        内存 + 调 API
src/auth.js         当前用户
src/pages/login.js  登录
data/tihua.db       本地库（git 忽略）
```

## 接口

- `POST /api/auth/login` `{username, password}`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `GET  /api/batches/:batchId` 工作人员
- `PATCH /api/batches/:batchId` 按角色拦字段
- `POST /api/batches/:batchId/report`
- `POST /api/batches/:batchId/trace`
- `POST /api/batches/:batchId/reset` 管理员 / 溯源
- `GET  /api/public/trace/:batchId` 公开
- `GET  /api/public/command` command wall
- `GET  /api/public/stage/:batchId` 公开大屏
- `GET  /api/audit?batchId=` 工作人员
- `GET  /api/djtk/status` 离线语音与模型状态
- `POST /api/djtk/transcribe` PCM16 → 本地识别文字
- `POST /api/djtk/ask` `{question, history?}` → `{answer, audioBase64, mime, voice}`
- `POST /api/djtk/tts` `{text}` → `{audioBase64, mime, voice}`

会话 cookie：`tihua_session`，httpOnly，SameSite=Lax。口令 bcryptjs（cost 10）。SQL 全是参数化。服务端不打口令日志。

## 现场两分钟路径

给评委看，用人话走（先登录 yangzhi 或 guanli）：

1. 「产品信息」：看是否合格准予上市
2. 下一步：怎么养的
3. 下一步：现场有没有检出兽药
4. 下一步：实验室复核和鸡健不健康
5. 下一步：生成检测报告（suyuan / guanli）
6. 下一步：出追溯码
7. 下一步：看买家扫开是什么；或退出后再打开 `#/trace/蓟化-2026-0812`

赶时间：在「产品信息」点「生成检测报告」（需要溯源或管理员账号）。

## 路由

- `#/dashboard` 产品信息（登录后，须先选批次）
- `#/batches` 选择批次
- `#/farm` `#/screen`（安全检测） `#/eval` `#/report` `#/qr` `#/consumer`（客户端显示）
- `#/trace/蓟化-2026-0812` 扫码，公开
- `#/stage/蓟化-2026-0812` 新版指挥舱，公开（`#/wall/...` 同义）
- `?view=classic#/stage/蓟化-2026-0812` 经典可视化，公开；顶部可一键切回新版
