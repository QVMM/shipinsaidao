# 本地交付包校验值

构建日期：2026-09-21　目标平台：Windows 10/11 x64

正式比赛首选——Windows 本地 Web 版：

```text
67e90f8902772d526b1f480653e28dd12b43259a1c7960a1ff45c9031661087c  替抗蓟化-Windows本地Web版-1.0.0-x64.zip
```

Electron 备用包：

```text
f17b6d09dce081e80e064c3e8ef7cd631c3edc6b26baab28d368e3f0bc33f83b  替抗蓟化离线竞赛版 Setup 1.0.0.exe
2038b75fc67bc1b93e6d773079c333feb8ba2188348043355e8af4d711eee355  替抗蓟化离线竞赛版 1.0.0.exe
```

复制到 U 盘后，可在 Windows PowerShell 中运行 `Get-FileHash -Algorithm SHA256 "文件名.exe"`；结果必须与上面完全一致。

当前包未使用商业 Windows 代码签名证书。首次打开若出现 SmartScreen，按部署文档中的“更多信息 → 仍要运行”处理。正式对外分发时应使用项目方的 Windows 代码签名证书重新签名。
