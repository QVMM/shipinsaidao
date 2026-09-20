# 本地交付包校验值

构建日期：2026-09-20　平台：macOS Apple Silicon（arm64）

```text
9d9d767e13697a2bdc1c5b1d116d5fe19d7257ca5aa927fd36628158b127dd18  替抗蓟化离线竞赛版-1.0.0-arm64.dmg
485a8db38b57d0946200b0630ddca044aa595287d825d25e9f0780533d30d03b  替抗蓟化离线竞赛版-1.0.0-arm64-mac.zip
```

复制到 U 盘后可运行 `shasum -a 256 文件名`；结果必须与上面完全一致。

当前包未使用 Apple Developer ID 签名。首次打开时按部署文档中的“隐私与安全性 → 仍要打开”处理。正式对外分发时应使用项目方的 Apple Developer ID 重新签名和公证。
