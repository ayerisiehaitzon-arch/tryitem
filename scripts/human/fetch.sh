#!/usr/bin/env bash
# 下载捏人用的原始素材（MakeHuman 和 Quaternius 的动作库，都是 CC0），放到 .cache/human-src/：
#   makehuman/  MakeHuman 主仓库里的 makehuman/data（基础网格、形变目标、骨骼和权重、眼球，全是文本）
#   deb/        Ubuntu 的 makehuman-data 1.1.1 包（皮肤、头发、衣服、眉毛、睫毛的贴图和 .mhclo）
#   npm/        npm 包 makehuman-data 0.0.2（头发、衣服这些代理网格的 JSON 版）
#   ual/        Quaternius Universal Animation Library 的 glTF 版
#   packs/      MakeHuman 社区资源包（files.makehumancommunity.org/asset_packs，CC0 / CC BY）里用到的那几件衣服、鞋、帽子：
#               .mhclo、.obj、.mhmat 和贴图，还有包里记作者、许可、来源页的 packs/<包>.json（下载的 zip 放在 assetpacks/）
# 一共下载约 1.2GB（社区资源包占 770MB）；之后 npm run build-human 生成 viewer/human/（仓库里已经带着生成好的数据，只有改了构建脚本才需要重来）。
# 只用 git、curl、ar、tar、unzip；固定到构建时用的版本，校验和对不上就停。
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

echo '1/5 MakeHuman 仓库（makehuman/data）'
fetch_git makehuman https://github.com/makehumancommunity/makehuman.git a8bc2d54ff0ac92e78ff71431b1023eda42bf482 \
  makehuman/data/3dobjs makehuman/data/targets makehuman/data/modifiers makehuman/data/rigs makehuman/data/eyes

echo '2/5 Ubuntu makehuman-data 1.1.1'
fetch_file makehuman-data_1.1.1-1_all.deb \
  https://archive.ubuntu.com/ubuntu/pool/universe/m/makehuman/makehuman-data_1.1.1-1_all.deb \
  881a79c3a6640e2ecc579093f6895d161fd902856504b123ef750e843f4304a7
if [ ! -d deb/usr ]; then
  rm -rf deb.tmp && mkdir deb.tmp
  (cd deb.tmp && ar x ../makehuman-data_1.1.1-1_all.deb && mkdir x && tar -xf data.tar.* -C x)
  mv deb.tmp/x deb && rm -rf deb.tmp
fi

echo '3/5 npm makehuman-data 0.0.2'
fetch_file makehuman-data-0.0.2.tgz https://registry.npmjs.org/makehuman-data/-/makehuman-data-0.0.2.tgz \
  86f5d0072e2701031f8bb71606d9b948fc82ccca36a304661b0a46395b9d9e5e
if [ ! -d npm/package ]; then mkdir -p npm && tar -xzf makehuman-data-0.0.2.tgz -C npm; fi

echo '4/5 Quaternius Universal Animation Library'
fetch_git ual https://github.com/J-Ponzo/gltf-universal-animation-library.git e24c23cf2a1323488a3faa226ea7ea21f644b73e

echo '5/5 MakeHuman 社区资源包'
# 每个包只解出用得到的那几件，而且只要文本（.obj .mhclo .mhmat）和图片，别的文件不解
fetch_pack() { # 包 文件 sha256 衣服目录…
  local pack=$1 file=$2 sum=$3 d; shift 3
  mkdir -p assetpacks packs
  fetch_file "assetpacks/$file" "https://files.makehumancommunity.org/asset_packs/$pack/$file" "$sum"
  unzip -q -o "assetpacks/$file" "packs/$pack.json" -d packs
  for d in "$@"; do
    [ -d "packs/clothes/$d" ] && continue
    unzip -Z1 "assetpacks/$file" | grep -iE "^clothes/$d/[^/]+\.(obj|mhclo|mhmat|png|jpg)$" | xargs -d '\n' unzip -q -o "assetpacks/$file" -d packs
  done
}
fetch_pack shirts01 shirts01_cc0.zip a5a723b0e84a109bb190fcfeac7f1de4138d875da3e30fe5b3340eac9f38bcd3 toigo_fisherman_sweater namuhekam_male_polo_shirt
fetch_pack shirts02 shirts02_ccby.zip d711ca9f73212de855257ac08422e1e0ccb802e5231315c2a360d0fcfea5033e elvs_hooded_sweat_jacket1 mindfront_knitted_sweater_01 mindfront_lusekofta elvs_male_shirt_untucked_bd1
fetch_pack pants01 pants01_cc0.zip e4e0ec60db34f279be291a83cfd7b342a7c5cf09bb7676682a5f39f4f6ac4ad9 cortu_cargo_pants toigo_wool_pants
fetch_pack pants02 pants02_ccby.zip 9dbcd65e03ab100977079b6960e91c334bed92e948aeda5423f11997a133904a mindfront_male_trousers_1
fetch_pack pants03 pants03_ccby.zip 8753f0cd79a9987a6f490ec5621a4a392df90647ca504fa2c1a500f9c3c2f26a elvs_male_trouser_short_1 mindfront_male_swimming_trunks_01
fetch_pack suits01 suits01_cc0.zip 2b1d8676f3863b188e9eea98c1d8f234543d54c440e791d92b819f8ee1861f19 toigo_suit_with_dinner_jacket toigo_male_suit_3 toigo_male_double-breasted_suit
fetch_pack shoes01 shoes01_cc0.zip ded3f70428505eabbf1f6d7b5f61196a7366ef20757103d276ad0ed336c35ada toigo_ankle_boots_male
fetch_pack shoes02 shoes02_ccby.zip 1b544d87dd8b3d3a9c8317e4f059be456491be979cbc9984fc53f403046f5061 culturalibre_sneakers punkduck_running_shoes_01 punkduck_comfortable_sneakers mindfront_shoes_oxford_male
fetch_pack shoes03 shoes03_ccby.zip 7818b43a520a90bb0286aaa1e137ddb9bbe59640c3edbdf4d9d849064ec2761b mindfront_shoes_biker_boots_male
fetch_pack hats01 hats01_cc0.zip 97b70d7bd90e74ee87a49faeb7c4a1b2762b311902974db575851daaae05b50e jujube_newsboy_cap
fetch_pack hats03 hats03_cc-by.zip 2702d58fa04e57235881551c45adcda36a6eafde8043c2695375bc0b4b79f550 mindfront_knitted_hat_01

echo "好了：$(pwd)。接着运行 npm run build-human"
