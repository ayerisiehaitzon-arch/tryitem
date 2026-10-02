#!/usr/bin/env bash
# 下载捏人用的原始素材（MakeHuman 和 Quaternius 的动作库，都是 CC0），放到 .cache/human-src/：
#   makehuman/  MakeHuman 主仓库里的 makehuman/data（基础网格、形变目标、骨骼和权重、眼球，全是文本）
#   deb/        Ubuntu 的 makehuman-data 1.1.1 包（皮肤、头发、衣服、眉毛、睫毛的贴图和 .mhclo）
#   npm/        npm 包 makehuman-data 0.0.2（头发、衣服这些代理网格的 JSON 版）
#   ual/        Quaternius Universal Animation Library 的 glTF 版
#   packs/      MakeHuman 社区资源包（files.makehumancommunity.org/asset_packs，CC0 / CC BY）里用到的那几款发型、胡子和衣服、鞋、帽子：
#               hair/、clothes/ 下的 .mhclo、.obj、.mhmat 和贴图，还有包里记作者、许可、来源页的 packs/<包>.json（下载的 zip 放在 assetpacks/）
# 一共下载约 2.5GB（社区资源包占 2GB，其中 dress03 一个包就 490MB）；之后 npm run build-human 生成 viewer/human/（仓库里已经带着生成好的数据，只有改了构建脚本才需要重来）。
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
fetch_pack() { # 包 文件 sha256 目录…（发型包里的在 hair/ 下，其余的在 clothes/ 下）
  local pack=$1 file=$2 sum=$3 d; shift 3
  mkdir -p assetpacks packs
  fetch_file "assetpacks/$file" "https://files.makehumancommunity.org/asset_packs/$pack/$file" "$sum"
  unzip -q -o "assetpacks/$file" "packs/$pack.json" -d packs
  for d in "$@"; do
    [ -d "packs/clothes/$d" ] || [ -d "packs/hair/$d" ] && continue
    unzip -Z1 "assetpacks/$file" | grep -iE "^(clothes|hair)/$d/[^/]+\.(obj|mhclo|mhmat|png|jpg)$" | xargs -d '\n' unzip -q -o "assetpacks/$file" -d packs
  done
}
fetch_pack shirts01 shirts01_cc0.zip a5a723b0e84a109bb190fcfeac7f1de4138d875da3e30fe5b3340eac9f38bcd3 toigo_fisherman_sweater namuhekam_male_polo_shirt
fetch_pack shirts02 shirts02_ccby.zip d711ca9f73212de855257ac08422e1e0ccb802e5231315c2a360d0fcfea5033e elvs_hooded_sweat_jacket1 mindfront_knitted_sweater_01 mindfront_lusekofta elvs_male_shirt_untucked_bd1 \
  punkduck_lace_up_blouse punkduck_off-shoulder_long-sleeve_top ews_striped_shirt
fetch_pack shirts03 shirts03_ccby.zip b3ff3596723dbc87cb07389895da760b667cf413f2c67869ccb0cdfb82a79a8a punkduck_retro_top punkduck_high_neck_crop_top
fetch_pack pants01 pants01_cc0.zip e4e0ec60db34f279be291a83cfd7b342a7c5cf09bb7676682a5f39f4f6ac4ad9 cortu_cargo_pants toigo_wool_pants
fetch_pack pants02 pants02_ccby.zip 9dbcd65e03ab100977079b6960e91c334bed92e948aeda5423f11997a133904a mindfront_male_trousers_1 elvs_jeans_bootcut mindfront_female_trousers_1 elvs_disco_pants_skinny
fetch_pack pants03 pants03_ccby.zip 8753f0cd79a9987a6f490ec5621a4a392df90647ca504fa2c1a500f9c3c2f26a elvs_male_trouser_short_1 mindfront_male_swimming_trunks_01
fetch_pack suits01 suits01_cc0.zip 2b1d8676f3863b188e9eea98c1d8f234543d54c440e791d92b819f8ee1861f19 toigo_suit_with_dinner_jacket toigo_male_suit_3 toigo_male_double-breasted_suit \
  toigo_female_suit toigo_female_suit_2 toigo_female_double-breasted_suit
fetch_pack suits03 suits03_cc-by.zip 74ace28794d27186a3f3ee26058f16906fe3c46f9f7e35a9ac7f622cd5e821eb punkduck_tennis_dress
fetch_pack dress01 dress01_cc0.zip f49ba54a3c93acd3c3307cc5a96cfc65daf8abfed9212a7e580791d821c9e93a toigo_camisole_dress_with_full_skirt toigo_dress_with_tiered_skirt
fetch_pack dress02 dress02_cc-by.zip 981f8b91d640415e7658ad700e987ecf28d5eb4e7337c02b715211ea483071b7 elvs_halter_dress_knee_length
fetch_pack dress03 dress03_cc-by.zip d35487edda8347ac8d0250207007c18056d7aaac404e91946bf9cf1399f2bcd8 punkduck_middle_length_qipao punkduck_evening_gown \
  mindfront_f_dress_06 mindfront_f_dress_08 mindfront_f_dress_11
fetch_pack skirts01 skirts01_cc0.zip 293fa0c15e28e8dcea8dfff20cae31aa4b0d1268a6e6ba0a53a92ebb0f36c882 toigo_long_full_skirt
fetch_pack skirts02 skirts02_cc-by.zip 20958a4669d88efc8295e2a4f5c97677f97ca47607478ee99e1a141525cff5b3 elvs_pleated_plaid_mini_skirt mtknife_pleated_mini_skirt elvs_pencil_skirt \
  punkduck_retro_polka_dot_skirt
fetch_pack shoes01 shoes01_cc0.zip ded3f70428505eabbf1f6d7b5f61196a7366ef20757103d276ad0ed336c35ada toigo_ankle_boots_male toigo_ballet_flats toigo_mj_cloth_shoes toigo_ankle_boots_female \
  toigo_ballet_flats_with_bows cortu_t-bar cortu_floppy_overknee_shoes
fetch_pack shoes02 shoes02_ccby.zip 1b544d87dd8b3d3a9c8317e4f059be456491be979cbc9984fc53f403046f5061 culturalibre_sneakers punkduck_running_shoes_01 punkduck_comfortable_sneakers mindfront_shoes_oxford_male \
  mindfront_shoes_monk_strap_male elvs_male_flip_flop_sandals1 punkduck_kill_bill_shoes punkduck_tennis_shoes punkduck_cycling_shoes elvs_flatshoe_pointy1 elvs_flatshoe_plain1
fetch_pack shoes03 shoes03_ccby.zip 7818b43a520a90bb0286aaa1e137ddb9bbe59640c3edbdf4d9d849064ec2761b mindfront_shoes_biker_boots_male punkduck_riding_boots \
  punkduck_medieval_boots madmanny_tight_leather_boots
fetch_pack hats01 hats01_cc0.zip 97b70d7bd90e74ee87a49faeb7c4a1b2762b311902974db575851daaae05b50e jujube_newsboy_cap aethelraed_unraed_cloche_hat
fetch_pack hair01 hair01_cc0.zip 49445d69848a313ec41a9970f6a0fe4bcf925c9f1c6ef40a76f119c2e07940c9 culturalibre_hair_02 sonntag78_junglebook_hair \
  toigo_blunt_bob_with_bangs toigo_curled_under_bob toigo_inverted_bob elvs_double_mh_braid rehmanpolanski_hair_bun_brown
fetch_pack hair02 hair02_ccby.zip c681e5efd37df4007a52253a8d071aedbfe3b614f199d8dae4ae76d5bd7d95c9 elvs_maxwell_hair elvs_grump_hair elvs_keylth_hair \
  elvs_that_80s_babe_hair elvs_braided_rows elvs_micky_afro elvs_50s_updo elvs_adrienne_hair elvs_ashley_may_hair elvs_braid_bun elvs_short_daisy_hair \
  elvs_hazel_hair elvs_island_princess_hair elvs_katherine_hair elvs_lara_hair
fetch_pack hats03 hats03_cc-by.zip 2702d58fa04e57235881551c45adcda36a6eafde8043c2695375bc0b4b79f550 mindfront_knitted_hat_01 culturalibre_cl_bowler_hat punkduck_sun_visor_sports_visor
fetch_pack bodyparts05 bodyparts05_cc0.zip 262bba42246f85b2a91f493dd920296b258a3b4544eb495c91c4d08e57c528fd culturalibre_faun_beard grinsegold_beard_sigmund_wip \
  rehmanpolanski_beard_viking rehmanpolanski_moustache_viking wdg_scruffy_beard
fetch_pack bodyparts06 bodyparts06_cc-by.zip 09ed71439c853eac01a92f6e4463f15d0701f08b7d9ff777771d10c3e590e770 culturalibre_dal_moustache elvs_scruffy_beard1 \
  grinsegold_full_beard grinsegold_moustache

echo "好了：$(pwd)。接着运行 npm run build-human"
