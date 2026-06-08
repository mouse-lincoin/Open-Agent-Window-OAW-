#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Open Agent Window — 开发环境初始化"

if ! command -v node >/dev/null 2>&1; then
  echo "错误: 未找到 Node.js，请安装 Node.js >= 18"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "错误: Node.js 版本过低 ($(node -v))，需要 >= 18"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "==> 安装 pnpm..."
  corepack enable
  corepack prepare pnpm@10.33.3 --activate
fi

echo "==> Node $(node -v) / pnpm $(pnpm -v)"

echo "==> 安装依赖..."
pnpm install

if [ ! -f .env ]; then
  echo "==> 复制 .env.example -> .env"
  cp .env.example .env
fi

mkdir -p data

echo "==> 完成。运行 pnpm dev 启动开发环境。"
