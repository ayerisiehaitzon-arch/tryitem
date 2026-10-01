#!/usr/bin/env bash
# 下载捏人用的原始素材（MakeHuman 和 Quaternius 的动作库，都是 CC0），放到 .cache/human-src/：
#   makehuman/  MakeHuman 主仓库里的 makehuman/data（基础网格、形变目标、骨骼和权重、眼球，全是文本）
#   deb/        Ubuntu 的 makehuman-data 1.1.1 包（皮肤、头发、衣服、眉毛、睫毛的贴图和 .mhclo）
#   npm/        npm 包 makehuman-data 0.0.2（头发、衣服这些代理网格的 JSON 版）
#   ual/        Quaternius Universal Animation Library 的 glTF 版
# 一共下载约 450MB；之后 npm run build-human 生成 viewer/human/（仓库里已经带着生成好的数据，只有改了构建脚本才需要重来）。
# 只用 git、curl、ar、tar；固定到构建时用的版本，校验和对不上就停。
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=.cache/human-src
mkdir -p "$SRC"
cd "$SRC"

fetch_git() { # 目录 仓库 提交 [稀疏检出的路径…]
  local dir=$1 url=$2 rev=$3; shift 3
  [ -d "$dir/.git" ] && return
  git init -q "$dir"
  git -C "$dir" remote add origin "$url"
  if [ $# -gt 0 ]; then git -C "$dir" sparse-checkout set "$@"; fi
  git -C "$dir" fetch -q --depth 1 --filter=blob:none origin "$rev"
  git -C "$dir" -c advice.detachedHead=false checkout -q FETCH_HEAD
}

fetch_file() { # 文件 地址 sha256
  local file=$1 url=$2 sum=$3
  if [ ! -f "$file" ]; then curl -fL --retry 3 -o "$file.part" "$url" && mv "$file.part" "$file"; fi
  echo "$sum  $file" | sha256sum -c --quiet - || { echo "校验和不对：$file" >&2; exit 1; }
}

echo '1/4 MakeHuman 仓库（makehuman/data）'
fetch_git makehuman https://github.com/makehumancommunity/makehuman.git a8bc2d54ff0ac92e78ff71431b1023eda42bf482 \
  makehuman/data/3dobjs makehuman/data/targets makehuman/data/modifiers makehuman/data/rigs makehuman/data/eyes

echo '2/4 Ubuntu makehuman-data 1.1.1'
fetch_file makehuman-data_1.1.1-1_all.deb \
  https://archive.ubuntu.com/ubuntu/pool/universe/m/makehuman/makehuman-data_1.1.1-1_all.deb \
  881a79c3a6640e2ecc579093f6895d161fd902856504b123ef750e843f4304a7
if [ ! -d deb/usr ]; then
  rm -rf deb.tmp && mkdir deb.tmp
  (cd deb.tmp && ar x ../makehuman-data_1.1.1-1_all.deb && mkdir x && tar -xf data.tar.* -C x)
  mv deb.tmp/x deb && rm -rf deb.tmp
fi

echo '3/4 npm makehuman-data 0.0.2'
fetch_file makehuman-data-0.0.2.tgz https://registry.npmjs.org/makehuman-data/-/makehuman-data-0.0.2.tgz \
  86f5d0072e2701031f8bb71606d9b948fc82ccca36a304661b0a46395b9d9e5e
if [ ! -d npm/package ]; then mkdir -p npm && tar -xzf makehuman-data-0.0.2.tgz -C npm; fi

echo '4/4 Quaternius Universal Animation Library'
fetch_git ual https://github.com/J-Ponzo/gltf-universal-animation-library.git e24c23cf2a1323488a3faa226ea7ea21f644b73e

echo "好了：$(pwd)。接着运行 npm run build-human"
