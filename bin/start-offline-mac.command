#!/bin/zsh
set -eu

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
cd "$PROJECT_DIR"

if [[ ! -d node_modules ]]; then
  print "缺少本地运行依赖。请先按 docs/DEPLOYMENT_OFFLINE.md 完成一次部署。"
  read "?按回车键退出..."
  exit 1
fi

npm run offline:check
npm run desktop
