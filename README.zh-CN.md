# 替抗蓟划 减抗鸡肉全链条质控与溯源平台

内部可上线的全栈：工作人员登录后改自己负责的一段，写进 SQLite；买家扫码不用登录。

第一次登录应立刻看懂：这是一批减抗鸡肉从养殖到上桌的安全与追溯；这批能不能上桌；下一步按哪个按钮。

产品只写替抗蓟划。药材只写大蓟、大蓟粗提物。批次蓟划-2026-0812。不要写蓬、蒨。

## 怎么跑

```
npm install
npm run seed
npm run build
npm start
```

浏览器打开 http://127.0.0.1:4173/

### 本地离线部署

先在有网络或已具备完整 `node_modules` 的电脑完成一次准备：

```
npm ci
npm run build
npm run seed
```

之后即使断网，也只需运行：

```
npm run offline
```

再打开 http://127.0.0.1:4173/。离线模式下，登录、SQLite 数据、检测判定、报告、追溯码、公开扫码页、指挥舱和本地证据问答均在本机运行；即使没有 `.env`，离线启动器也会为本次本机进程生成临时会话密钥。风险情报页使用经审核的离线快照，不依赖现场网络。

注意：`npm ci` 是首次准备动作；若交付到另一台完全没有依赖的电脑，需要把整个项目（包括 `node_modules` 和 `dist`）一起复制，或提前在那台电脑联网完成上述准备。数据库默认保存在 `data/tihua.db`。

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

### DJTK 智控助手

指挥舱 `#/stage` 右侧有可对话数字人：

- `DJTK_STAGE_TOKEN`：仅服务端；**必须在 Render Dashboard 配置长随机值**。请求头 `x-stage-token`（或 body.stageToken）与之匹配时可走展台鉴权；工作人员登录后 cookie 会话即可，无需令牌。前端**不再**内置或从 `/api/djtk/status` 下发任何默认令牌。
- 生产环境 `SESSION_SECRET` 必填且不得为 `dev-only-change-me`，否则进程拒绝启动。

语音采用双通道：线上版配置 `MIMO_API_KEY` 后优先使用 MiMo V2.5 ASR 与知性女声 TTS，接口、密钥或网络异常时自动回退浏览器语音能力；Windows 比赛包内置 SenseVoice 与本地女声模型，可作为断网备用。Render 部署需配置 `MIMO_API_KEY`，并**轮换** `DJTK_STAGE_TOKEN`（勿沿用旧的公开默认值）。

接口：`POST /api/djtk/ask`（本地证据问答）；`POST /api/djtk/transcribe`（联网语音识别）；`POST /api/djtk/tts`（联网女声）；`GET /api/djtk/status`（语音能力与运行状态，不含密钥）。

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

买家页 `#/consumer`、`#/trace/蓟划-2026-0812` 走 `GET /api/public/trace/:batchId`，不用 cookie。

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
server/local-assistant.js  本地证据问答与比赛规定话术
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
- `GET  /api/djtk/status` 语音能力与运行状态
- `POST /api/djtk/ask` `{question, history?}` → `{answer, audioBase64, mime, voice}`
- `POST /api/djtk/transcribe` PCM16 录音 → MiMo ASR 文本
- `POST /api/djtk/tts` 文本 → MiMo 女声音频；失败由前端回退设备女声

会话 cookie：`tihua_session`，httpOnly，SameSite=Lax。口令 bcryptjs（cost 10）。SQL 全是参数化。服务端不打口令日志。

## 现场两分钟路径

给评委看，用人话走（先登录 yangzhi 或 guanli）：

1. 「产品信息」：看是否合格准予上市
2. 下一步：怎么养的
3. 下一步：现场有没有检出兽药
4. 下一步：实验室复核和鸡健不健康
5. 下一步：生成检测报告（suyuan / guanli）
6. 下一步：出追溯码
7. 下一步：看买家扫开是什么；或退出后再打开 `#/trace/蓟划-2026-0812`

赶时间：在「产品信息」点「生成检测报告」（需要溯源或管理员账号）。

## 路由

- `#/dashboard` 产品信息（登录后，须先选批次）
- `#/batches` 选择批次
- `#/farm` `#/screen`（安全检测） `#/eval` `#/report` `#/qr` `#/consumer`（客户端显示）
- `#/trace/蓟划-2026-0812` 扫码，公开
- `#/stage/蓟划-2026-0812` 新版指挥舱，公开（`#/wall/...` 同义）
- `?view=classic#/stage/蓟划-2026-0812` 经典可视化，公开；顶部可一键切回新版
