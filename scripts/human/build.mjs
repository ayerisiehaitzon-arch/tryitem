// 把 MakeHuman（CC0）的资源转成网页用的紧凑数据：viewer/human/（npm run build-human）
// 素材默认从 scripts/human/fetch.sh 下载到的 .cache/human-src/ 里读，也可以用环境变量指到别处：
//   MH_GH  = makehumancommunity/makehuman 仓库里的 makehuman/data（基础网格、形变目标、默认骨骼和权重、眼球，全是文本）
//   MH_DEB = MakeHuman 1.1.1 的资源目录（Ubuntu 的 makehuman-data 包解开后的 usr/share/makehuman/data：皮肤、头发、衣服、眉毛、睫毛的贴图和 .mhclo）
//   MH_NPM = npm 包 makehuman-data 的 public/data（头发、衣服等代理网格的 JSON 版，和 .mhclo 一一对应）
// 只读文本和图片，不碰任何二进制归档（.npz）。动作另由 anims.mjs 生成。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { parseObj, parseTarget, parseMhclo, parseMhmat, parseThreeJson } from './mhparse.mjs';
import { flowMap, removeLogo, uvCoverage, edgePad } from './texfx.mjs';
import { hairAO } from './hairao.mjs';
import { islands, classify, partMask } from './parts.mjs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = fileURLToPath(new URL('../..', import.meta.url)), SRC = path.join(ROOT, '.cache/human-src');
const GH = process.env.MH_GH ?? `${SRC}/makehuman/makehuman/data`;
const DEB = process.env.MH_DEB ?? `${SRC}/deb/usr/share/makehuman/data`;
const NPM = process.env.MH_NPM ?? `${SRC}/npm/package/public/data`;
const OUT = process.env.OUT ?? path.join(ROOT, 'viewer/human');
for (const [k, d] of [['MH_GH', GH], ['MH_DEB', DEB], ['MH_NPM', NPM]]) {
  if (!fs.existsSync(d)) { console.error(`找不到 ${d}：先运行 bash scripts/human/fetch.sh，或者用 ${k} 指到素材目录`); process.exit(1); }
}
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// —— 二进制块：所有数组顺序写进一个文件，JSON 里记偏移 ——
class Blob {
  constructor() { this.parts = []; this.size = 0; }
  add(typed) {
    const align = typed.BYTES_PER_ELEMENT;
    if (this.size % 4) { const pad = 4 - (this.size % 4); this.parts.push(Buffer.alloc(pad)); this.size += pad; }
    const off = this.size;
    this.parts.push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength));
    this.size += typed.byteLength;
    return { off, n: typed.length, t: typed.constructor.name.replace('Array', '') };
  }
  write(file) { fs.writeFileSync(file, Buffer.concat(this.parts)); return this.size; }
}

// —— 基础网格 ——
const base = parseObj(`${GH}/3dobjs/base.obj`);
const NV = base.v.length / 3;
const groups = {};
for (const f of base.faces) (groups[f.group] ??= new Set()).add(...[]) ;
for (const f of base.faces) for (const v of f.v) (groups[f.group] ??= new Set()).add(v);
log('base', NV, 'verts', base.faces.length, 'faces');

// 按 (顶点, UV) 拆点，输出渲染网格（三角形）+ 每个渲染点对应的基础顶点 + 每个三角形所在的四边形号（删面用）
function renderMesh(src, faceFilter = () => true) {
  const key = new Map(), map = [], uv = [], idx = [], faceOf = [];
  src.faces.forEach((f, fi) => {
    if (!faceFilter(f)) return;
    const ids = f.v.map((v, k) => {
      const t = f.t ? f.t[k] : -1;
      const kk = v * 1048576 + (t + 1);
      let id = key.get(kk);
      if (id === undefined) { id = map.length; key.set(kk, id); map.push(v); uv.push(t >= 0 ? src.vt[t * 2] : 0, t >= 0 ? src.vt[t * 2 + 1] : 0); }
      return id;
    });
    if (ids.length === 4) { idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]); faceOf.push(fi, fi); }
    else { idx.push(ids[0], ids[1], ids[2]); faceOf.push(fi); }
  });
  return { map, uv, idx, faceOf };
}

const blob = new Blob();
const meta = { version: 1, units: 'm', source: 'MakeHuman (CC0)', nv: NV };
// 位置：分米 → 米
meta.base = blob.add(Float32Array.from(base.v, (x) => x * 0.1));
const body = renderMesh(base, (f) => f.group === 'body');
meta.body = {
  map: blob.add(Uint16Array.from(body.map)),
  uv: blob.add(Float32Array.from(body.uv)),
  index: blob.add(Uint16Array.from(body.idx)),
  verts: body.map.length, tris: body.idx.length / 3,
};
log('body render', body.map.length, 'verts', body.idx.length / 3, 'tris');
// 身体的面属于哪个基础四边形（衣服的 delete_verts 按基础顶点删面）：直接存每个三角形的三个基础顶点就够了 —— 运行时用 map 查

// —— 形变目标 ——
const TQ = 1 / 4096; // 量化步长（米）：0.24mm
const targets = [];
function packTarget(name, idx, d, extra = {}) {
  // d 是分米；转米再量化
  const n = idx.length;
  const dense = n > NV * 0.6;
  let q;
  if (dense) {
    q = new Int16Array(NV * 3);
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) q[idx[i] * 3 + a] = Math.round((d[i * 3 + a] * 0.1) / TQ);
    targets.push({ name, dense: true, d: blob.add(q), ...extra });
  } else {
    q = new Int16Array(n * 3);
    let keep = 0;
    const ii = [];
    for (let i = 0; i < n; i++) {
      const x = Math.round((d[i * 3] * 0.1) / TQ), y = Math.round((d[i * 3 + 1] * 0.1) / TQ), z = Math.round((d[i * 3 + 2] * 0.1) / TQ);
      if (!x && !y && !z) continue;
      ii.push(idx[i]); q[keep * 3] = x; q[keep * 3 + 1] = y; q[keep * 3 + 2] = z; keep++;
    }
    targets.push({ name, i: blob.add(Uint16Array.from(ii)), d: blob.add(q.slice(0, keep * 3)), ...extra });
  }
}
const T = (rel) => parseTarget(`${GH}/targets/${rel}`);
// 左右两个目标合成一个（对称地一起动）
function sumTargets(list) {
  const acc = new Map();
  for (const t of list) for (let i = 0; i < t.idx.length; i++) {
    const v = t.idx[i];
    const a = acc.get(v) ?? [0, 0, 0];
    a[0] += t.d[i * 3]; a[1] += t.d[i * 3 + 1]; a[2] += t.d[i * 3 + 2];
    acc.set(v, a);
  }
  const idx = Uint32Array.from([...acc.keys()].sort((a, b) => a - b));
  const d = new Float32Array(idx.length * 3);
  idx.forEach((v, i) => d.set(acc.get(v), i * 3));
  return { idx, d };
}

// 1) 宏：人种 × 性别 × 年龄（只做成年：young 25 岁、old 90 岁）
for (const race of ['caucasian', 'african', 'asian']) for (const g of ['male', 'female']) for (const age of ['young', 'old']) {
  const t = T(`macrodetails/${race}-${g}-${age}.target`);
  packTarget(`macro/${race}-${g}-${age}`, t.idx, t.d, { f: [race, g, age] });
}
for (const g of ['male', 'female']) for (const age of ['young', 'old']) for (const m of ['minmuscle', 'averagemuscle', 'maxmuscle']) for (const w of ['minweight', 'averageweight', 'maxweight']) {
  const t = T(`macrodetails/universal-${g}-${age}-${m}-${w}.target`);
  packTarget(`macro/universal-${g}-${age}-${m}-${w}`, t.idx, t.d, { f: [g, age, m, w] });
}
// 身高、比例：只取中等肌肉中等体重那一组（随肌肉/体重的差别很小，省掉 5/6 的数据）
for (const g of ['male', 'female']) for (const age of ['young', 'old']) {
  for (const h of ['minheight', 'maxheight']) {
    const t = T(`macrodetails/height/${g}-${age}-averagemuscle-averageweight-${h}.target`);
    packTarget(`macro/height-${g}-${age}-${h}`, t.idx, t.d, { f: [g, age, h] });
  }
  for (const p of ['idealproportions', 'uncommonproportions']) {
    const t = T(`macrodetails/proportions/${g}-${age}-averagemuscle-averageweight-${p}.target`);
    packTarget(`macro/proportions-${g}-${age}-${p}`, t.idx, t.d, { f: [g, age, p] });
  }
}
for (const age of ['young', 'old']) for (const c of ['mincup', 'maxcup']) {
  const t = T(`breast/female-${age}-averagemuscle-averageweight-${c}-averagefirmness.target`);
  packTarget(`macro/breast-female-${age}-${c}`, t.idx, t.d, { f: ['female', age, c] });
}
for (const age of ['young', 'old']) for (const fm of ['minfirmness', 'maxfirmness']) {
  const t = T(`breast/female-${age}-averagemuscle-averageweight-averagecup-${fm}.target`);
  packTarget(`macro/breastfirm-female-${age}-${fm}`, t.idx, t.d, { f: ['female', age, fm] });
}
log('macro targets', targets.length);

// 2) 普通的滑杆：从 modeling_modifiers.json 里挑组；左右成对的合成一个
const MODS = JSON.parse(fs.readFileSync(`${GH}/modifiers/modeling_modifiers.json`, 'utf8'));
const WANT = new Set(['head', 'forehead', 'eyebrows', 'neck', 'eyes', 'nose', 'mouth', 'ears', 'chin', 'cheek', 'torso', 'hip', 'stomach', 'buttocks', 'armslegs', 'breast']);
const modifiers = [];
const seen = new Set();
for (const g of MODS) {
  if (!WANT.has(g.group)) continue;
  for (const m of g.modifiers) {
    if (!m.target) continue;
    const sym = /^[lr]-/.test(m.target);
    const baseName = sym ? m.target.slice(2) : m.target;
    const id = `${g.group}/${baseName}${m.min ? `|${m.min}-${m.max}` : ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const files = (side) => {
      const name = sym ? `${side}-${baseName}` : baseName;
      return m.min ? [`${g.group}/${name}-${m.min}.target`, `${g.group}/${name}-${m.max}.target`] : [`${g.group}/${name}.target`];
    };
    const parts = sym ? [files('l'), files('r')] : [files(null)];
    const load = (k) => sumTargets(parts.map((p) => T(p[k])));
    if (m.min) {
      const lo = load(0), hi = load(1);
      packTarget(`${id}<`, lo.idx, lo.d); const iLo = targets.length - 1;
      packTarget(`${id}>`, hi.idx, hi.d); const iHi = targets.length - 1;
      modifiers.push({ id, group: g.group, lo: iLo, hi: iHi });
    } else {
      const t = load(0);
      packTarget(id, t.idx, t.d); modifiers.push({ id, group: g.group, hi: targets.length - 1 });
    }
  }
}
// 几个围度（measure）：肩宽、腰围、臀围、胸围、脖子、上臂、大腿
for (const name of ['shoulder-dist', 'waist-circ', 'hips-circ', 'bust-circ', 'neck-circ', 'upperarm-circ', 'thigh-circ', 'calf-circ', 'upperarm-length', 'lowerarm-length', 'upperleg-height', 'lowerleg-height', 'napetowaist-dist']) {
  const lo = T(`measure/measure-${name}-decr.target`), hi = T(`measure/measure-${name}-incr.target`);
  packTarget(`measure/${name}<`, lo.idx, lo.d); const iLo = targets.length - 1;
  packTarget(`measure/${name}>`, hi.idx, hi.d);
  modifiers.push({ id: `measure/${name}`, group: 'measure', lo: iLo, hi: targets.length - 1 });
}
log('modifier targets', targets.length, 'modifiers', modifiers.length);

// 3) 表情单元（白种人那一套，所有人共用）
const EXPR_DIR = `${GH}/targets/expression/units/caucasian`;
const exprUnits = [];
for (const f of fs.readdirSync(EXPR_DIR).filter((f) => f.endsWith('.target')).sort()) {
  const t = parseTarget(`${EXPR_DIR}/${f}`);
  packTarget(`expr/${f.replace('.target', '')}`, t.idx, t.d);
  exprUnits.push({ id: f.replace('.target', ''), t: targets.length - 1 });
}
log('expression units', exprUnits.length);
meta.targets = targets;
meta.modifiers = modifiers;
meta.expr = exprUnits;
meta.tq = TQ;

// —— 骨骼：自己定一套游戏常用的骨架（和虚幻小白人同名），每根骨头 = MakeHuman 默认骨架（CC0）里几根骨头的合并 ——
//   关节位置 = 默认骨架里对应关节的那几个“关节小方块”顶点的平均（跟着形变走）；权重 = 默认权重（CC0）按合并关系相加，取最大的 4 个
const SKEL = JSON.parse(fs.readFileSync(`${GH}/rigs/default.mhskel`, 'utf8'));
const WTS = JSON.parse(fs.readFileSync(`${GH}/rigs/default_weights.mhw`, 'utf8')).weights;
const FACE = Object.keys(SKEL.bones).filter((b) => /^(jaw|special|oris|levator|orbicularis|temporalis|oculi|risorius|tongue)/.test(b));
const side = (s, list) => list.map((b) => b.replace(/\.X$/, `.${s}`));
const RIG = [
  // 名字, 父, 合并的默认骨头（权重）, 头关节, 尾关节
  ['pelvis', null, ['root', 'pelvis.L', 'pelvis.R'], 'root____head', 'spine05____head'],
  ['spine_01', 'pelvis', ['spine05', 'spine04'], 'spine05____head', 'spine04____tail'],
  ['spine_02', 'spine_01', ['spine03', 'spine02', 'breast.L', 'breast.R'], 'spine03____head', 'spine02____tail'],
  ['spine_03', 'spine_02', ['spine01'], 'spine01____head', 'spine01____tail'],
  ['neck_01', 'spine_03', ['neck01', 'neck02', 'neck03'], 'neck01____head', 'neck03____tail'],
  ['head', 'neck_01', ['head', ...FACE], 'head____head', 'head____tail'],
  // 眼球单独两根骨头：看镜头
  ['eye_l', 'head', ['eye.L'], 'eye.L____head', 'eye.L____tail'],
  ['eye_r', 'head', ['eye.R'], 'eye.R____head', 'eye.R____tail'],
];
for (const [s, u] of [['L', 'l'], ['R', 'r']]) {
  RIG.push(
    [`clavicle_${u}`, 'spine_03', [`clavicle.${s}`, `shoulder01.${s}`], `clavicle.${s}____head`, `shoulder01.${s}____tail`],
    [`upperarm_${u}`, `clavicle_${u}`, [`upperarm01.${s}`, `upperarm02.${s}`], `upperarm01.${s}____head`, `upperarm02.${s}____tail`],
    [`lowerarm_${u}`, `upperarm_${u}`, [`lowerarm01.${s}`, `lowerarm02.${s}`], `lowerarm01.${s}____head`, `lowerarm02.${s}____tail`],
    [`hand_${u}`, `lowerarm_${u}`, [`wrist.${s}`, `metacarpal1.${s}`, `metacarpal2.${s}`, `metacarpal3.${s}`, `metacarpal4.${s}`], `wrist.${s}____head`, `metacarpal2.${s}____tail`],
  );
  const F = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  F.forEach((f, k) => {
    for (let j = 1; j <= 3; j++) RIG.push([`${f}_0${j}_${u}`, j === 1 ? `hand_${u}` : `${f}_0${j - 1}_${u}`, [`finger${k + 1}-${j}.${s}`], `finger${k + 1}-${j}.${s}____head`, `finger${k + 1}-${j}.${s}____tail`]);
  });
  RIG.push(
    [`thigh_${u}`, 'pelvis', [`upperleg01.${s}`, `upperleg02.${s}`], `upperleg01.${s}____head`, `upperleg02.${s}____tail`],
    [`calf_${u}`, `thigh_${u}`, [`lowerleg01.${s}`, `lowerleg02.${s}`], `lowerleg01.${s}____head`, `lowerleg02.${s}____tail`],
    [`foot_${u}`, `calf_${u}`, [`foot.${s}`], `foot.${s}____head`, `foot.${s}____tail`],
    [`ball_${u}`, `foot_${u}`, Object.keys(SKEL.bones).filter((b) => b.startsWith('toe') && b.endsWith(`.${s}`)), `toe3-1.${s}____head`, `toe3-3.${s}____tail`],
  );
}
// 关节：每个关节一组顶点
const jointNames = [...new Set(RIG.flatMap((r) => [r[3], r[4]]))];
const jointVerts = jointNames.map((j) => { const v = SKEL.joints[j]; if (!v) throw new Error('joint ' + j); return v; });
const jv = [], jo = [];
for (const v of jointVerts) { jo.push(jv.length); jv.push(...v); }
jo.push(jv.length);
meta.rig = {
  bones: RIG.map(([name, parent, , h, t]) => ({ name, parent: parent ? RIG.findIndex((r) => r[0] === parent) : -1, head: jointNames.indexOf(h), tail: jointNames.indexOf(t) })),
  joints: { names: jointNames, verts: blob.add(Uint16Array.from(jv)), off: blob.add(Uint16Array.from(jo)) },
};
// 权重：每个基础顶点最多 4 根骨头
{
  const acc = Array.from({ length: NV }, () => new Map());
  RIG.forEach(([, , src], bi) => {
    for (const b of src) for (const [v, w] of WTS[b] ?? []) acc[v].set(bi, (acc[v].get(bi) ?? 0) + w);
  });
  const si = new Uint8Array(NV * 4), sw = new Uint8Array(NV * 4);
  let none = 0;
  acc.forEach((m, v) => {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s2, x) => s2 + x[1], 0);
    if (!sum) { none++; si[v * 4] = 0; sw[v * 4] = 255; return; }
    // 量化到 0…255 且四个加起来正好 255：先取整（向下），余数按小数部分从大到小补（不会出现负数绕回 255 的情况）
    const exact = top.map(([, w]) => (w / sum) * 255), q = exact.map(Math.floor);
    let left = 255 - q.reduce((a, b) => a + b, 0);
    exact.map((x, k) => [x - q[k], k]).sort((a, b) => b[0] - a[0]).forEach(([, k]) => { if (left > 0) { q[k]++; left--; } });
    top.forEach(([b], k) => { si[v * 4 + k] = b; sw[v * 4 + k] = q[k]; });
  });
  meta.rig.skinIndex = blob.add(si);
  meta.rig.skinWeight = blob.add(sw);
  log('rig', RIG.length, 'bones; verts without weights', none);
}

// —— 代理：眼球、眉毛、睫毛、牙齿、舌头、头发、衣服、鞋、帽子 ——
//   每个一个小文件 px/<id>.bin（gzip），用到才下载：渲染点 → 代理顶点、UV、三角形；代理顶点的贴合数据（三个基础顶点、权重、偏移）；要藏起来的身体顶点
fs.mkdirSync(`${OUT}/px`, { recursive: true });
fs.mkdirSync(`${OUT}/tex`, { recursive: true });
const texJobs = [];
// 贴图：转 WebP（带 alpha 的保留 alpha），记下尺寸
function tex(src, name, size, { q = 82, alpha = false } = {}) {
  const dst = `tex/${name}.webp`;
  texJobs.push(sharp(src).resize(size, size, { fit: 'fill' }).webp({ quality: q, alphaQuality: 92, effort: 5, ...(alpha ? {} : {}) }).toFile(`${OUT}/${dst}`));
  return dst;
}
// 衣服、鞋、帽子的贴图：去标志 → UV 岛往外填色（缩小、mipmap 时接缝不会漏进黑色或白色的底）→ 缩小 → WebP
// onData(rgba, W, H, r)：拿处理好的原尺寸贴图再做点别的（比如配色的权重图）
async function texCloth(src, name, size, { q = 80, geom = null, logos = [], onData = null } = {}) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, k = W / 2048;
  for (const L of logos) removeLogo(data, W, H, { ...L, box: L.box.map((x) => Math.round(x * k)), from: L.from.map((x) => Math.round(x * k)) });
  if (geom) {
    const r = renderMesh(geom.endsWith('.obj') ? parseObj(geom) : parseThreeJson(geom));
    edgePad(data, W, H, uvCoverage(r.uv, r.idx, W, H, 3));
    if (onData) await onData(data, W, H, r);
  }
  const dst = `tex/${name}.webp`;
  texJobs.push(sharp(data, { raw: { width: W, height: H, channels: 4 } }).removeAlpha().resize(size, size, { fit: 'fill' }).webp({ quality: q, effort: 5 }).toFile(`${OUT}/${dst}`));
  return dst;
}
const npmDir = (cat, name) => {
  const d = `${NPM}/proxies/${cat}`;
  const hit = fs.readdirSync(d).find((x) => x.toLowerCase() === name.toLowerCase());
  if (!hit) throw new Error(`npm 里没有 ${cat}/${name}`);
  const jf = fs.readdirSync(`${d}/${hit}`).find((f) => f.endsWith('.json'));
  return `${d}/${hit}/${jf}`;
};
const proxies = [];
async function proxy(cat, name, { label, geom, clo, maps, alpha = false, cull = true, extra = {}, split = null, bake = null }) {
  const g = geom.endsWith('.obj') ? parseObj(geom) : parseThreeJson(geom);
  const c = parseMhclo(clo);
  const uuidOf = (f) => fs.readFileSync(f, 'utf8').match(/^uuid\s+(\S+)/m)?.[1];
  if (g.meta?.uuid && uuidOf(clo) && g.meta.uuid !== uuidOf(clo)) throw new Error(`${name}: 网格和贴合数据不是同一版（uuid ${g.meta.uuid} ≠ ${uuidOf(clo)}）`);
  const nv = c.ref.length / 3;
  if (g.v.length / 3 !== nv) throw new Error(`${name}: 顶点数对不上 ${g.v.length / 3} vs ${nv}`);
  const r = renderMesh(g);
  const b = new Blob();
  const m = { id: `${cat}/${name}`, cat, name, label, nv, nr: r.map.length, tris: r.idx.length / 3, alpha, cull, z: c.zDepth, maps, ...extra };
  // 贴合数据：偏移从分米换成米；三个方向的缩放参考（两个基础顶点 + 原始距离）
  m.scale = c.scale.map((x) => (x ? [x[0], x[1], x[2] * 0.1] : null));
  let index = r.idx;
  if (split) {
    // 按三角形分两组（比如眼球的角膜）：先放 a 组再放 b 组，记下分界
    const A = [], B = [];
    for (let t = 0; t < index.length; t += 3) (split(r, t) ? B : A).push(index[t], index[t + 1], index[t + 2]);
    index = [...A, ...B];
    m.groups = [[0, A.length], [A.length, B.length]];
  }
  m.map = b.add(Uint16Array.from(r.map));
  m.uv = b.add(Float32Array.from(r.uv));
  m.index = b.add(r.map.length > 65535 ? Uint32Array.from(index) : Uint16Array.from(index));
  m.ref = b.add(Uint16Array.from(c.ref));
  m.w = b.add(Float32Array.from(c.w));
  m.off = b.add(Float32Array.from(c.off, (x) => x * 0.1));
  if (c.del.length) m.del = b.add(Uint16Array.from(c.del));
  // 额外烘焙的逐顶点数据（比如头发的自遮挡）
  if (bake) for (const [k, arr] of Object.entries(bake({ g, c, r }))) m[k] = b.add(arr);
  const raw = Buffer.concat(b.parts);
  const gz = zlib.gzipSync(raw, { level: 9 });
  m.file = `px/${cat}-${name}.bin`;
  m.bytes = raw.length;
  fs.writeFileSync(`${OUT}/${m.file}`, gz);
  proxies.push(m);
  return m;
}
const mat = (cat, name, file) => parseMhmat(`${DEB}/${cat}/${name}/${file ?? `${name}.mhmat`}`);

// 眼球（GitHub 的 obj + mhclo）：角膜那几圈三角形单独一组（UV 落在贴图右下角的透明圆里）
{
  const { data: eyeA, info } = await sharp(`${DEB}/eyes/materials/brown_eye.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (u, v) => { const x = Math.min(info.width - 1, Math.floor(u * info.width)), y = Math.min(info.height - 1, Math.floor((1 - v) * info.height)); return eyeA[(y * info.width + x) * 4 + 3]; };
  await proxy('eyes', 'high-poly', {
    label: '眼球', geom: `${GH}/eyes/high-poly/high-poly.obj`, clo: `${GH}/eyes/high-poly/high-poly.mhclo`, maps: {},
    split: (r, t) => { const ids = [r.idx[t], r.idx[t + 1], r.idx[t + 2]]; const u = ids.reduce((s2, i) => s2 + r.uv[i * 2], 0) / 3, v = ids.reduce((s2, i) => s2 + r.uv[i * 2 + 1], 0) / 3; return alphaAt(u, v) < 128; },
  });
  const EYE = {};
  for (const f of fs.readdirSync(`${DEB}/eyes/materials`).filter((f) => f.endsWith('_eye.png'))) {
    const col = f.replace('_eye.png', '');
    EYE[col] = tex(`${DEB}/eyes/materials/${f}`, `eye-${col}`, 1024, { q: 86, alpha: true });
  }
  meta.eyeTex = EYE;
}
// 眉毛、睫毛
const BROW_LABEL = ['自然', '细挑', '平直', '浓密', '弯眉', '细短', '稀疏', '剑眉', '粗浓', '柳叶', '短平', '高挑'];
for (let i = 1; i <= 12; i++) {
  const n = `eyebrow${String(i).padStart(3, '0')}`;
  await proxy('eyebrows', n, { label: BROW_LABEL[i - 1], geom: npmDir('eyebrows', n), clo: `${DEB}/eyebrows/${n}/${n}.mhclo`, maps: { map: tex(`${DEB}/eyebrows/${n}/${n}.png`, `brow-${n}`, 512, { q: 88, alpha: true }) }, alpha: true, extra: { mean: await meanColor(`${DEB}/eyebrows/${n}/${n}.png`) } });
}
for (let i = 1; i <= 4; i++) {
  const n = `eyelashes0${i}`;
  await proxy('eyelashes', n, { label: ['自然', '浓密', '纤长', '稀疏'][i - 1], geom: npmDir('eyelashes', n), clo: `${DEB}/eyelashes/${n}/${n}.mhclo`, maps: { map: tex(`${DEB}/eyelashes/${n}/${n}.png`, `lash-${n}`, 512, { q: 88, alpha: true }) }, alpha: true, cull: false });
}
await proxy('teeth', 'teeth_base', { label: '牙齿', geom: npmDir('teeth', 'teeth_base'), clo: `${DEB}/teeth/teeth_base/teeth_base.mhclo`, maps: { map: tex(`${DEB}/teeth/materials/teeth.png`, 'teeth', 512, { q: 85 }) } });
await proxy('tongue', 'tongue01', { label: '舌头', geom: npmDir('tongue', 'tongue01'), clo: `${DEB}/tongue/tongue01/tongue01.mhclo`, maps: { map: tex(`${DEB}/tongue/tongue01/${mat('tongue', 'tongue01').diffuseTexture}`, 'tongue', 512, { q: 85 }) } });
// 头发
const HAIR = { short04: '平头', short02: '碎短发', short01: '短发', short03: '女式短发', bob02: '齐耳短发', bob01: '斜刘海波波头', long01: '长直发', ponytail01: '马尾', braid01: '麻花辫', afro01: '爆炸头' };
// 发色、眉色可以染：记下贴图里不透明部分的平均亮度和颜色，网页里按“亮度 / 平均亮度 × 染的颜色”重新上色
async function meanColor(file) {
  const { data, info } = await sharp(file).resize(256, 256).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g2 = 0, b = 0, n = 0;
  for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] > 160) { r += data[i * 4]; g2 += data[i * 4 + 1]; b += data[i * 4 + 2]; n++; }
  const lin = (x) => ((x / n / 255) <= 0.04045 ? x / n / 255 / 12.92 : ((x / n / 255 + 0.055) / 1.055) ** 2.4);
  const c = [lin(r), lin(g2), lin(b)];
  return { rgb: c.map((x) => +x.toFixed(4)), lum: +(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).toFixed(4) };
}
// 头发烘焙用的身体：基础网格（米）+ 身体三角形；头的中心 = 头顶往下 11cm 那一圈的中心
const P0 = Float32Array.from(base.v, (x) => x * 0.1);
const bodyTris = Uint32Array.from(body.idx, (i) => body.map[i]);
const headCenter = (() => {
  let top = -Infinity;
  for (const i of body.map) top = Math.max(top, P0[i * 3 + 1]);
  const c = [0, 0, 0]; let n = 0;
  for (const i of new Set(body.map)) if (P0[i * 3 + 1] > top - 0.24) { for (let a = 0; a < 3; a++) c[a] += P0[i * 3 + a]; n++; }
  return [c[0] / n, top - 0.11, c[2] / n];
})();
// 代理在基础网格上的静止位置（和网页里 fitProxy 同一个公式）
function restProxy(c) {
  const nv = c.ref.length / 3, out = new Float32Array(nv * 3);
  const M = [0, 1, 2].map((a) => { const s2 = c.scale[a]; return s2 ? Math.abs(P0[s2[0] * 3 + a] - P0[s2[1] * 3 + a]) / (s2[2] * 0.1) : 1; });
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) {
    let v = 0;
    for (let k = 0; k < 3; k++) v += c.w[i * 3 + k] * P0[c.ref[i * 3 + k] * 3 + a];
    out[i * 3 + a] = v + M[a] * c.off[i * 3 + a] * 0.1;
  }
  return out;
}
for (const [n, label] of Object.entries(HAIR)) {
  const mm = mat('hair', n);
  const src = `${mm.dir}/${mm.diffuseTexture}`;
  const maps = { map: tex(src, `hair-${n}`, 2048, { q: 86, alpha: true }) };
  if (mm.normalmapTexture) maps.normal = tex(`${mm.dir}/${mm.normalmapTexture}`, `hair-${n}-n`, 1024, { q: 88 });
  // 发丝流向图（网页里沿发丝方向打高光）
  const { data: px, info } = await sharp(src).resize(1024, 1024, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const flow = flowMap(px, info.width, info.height);
  maps.flow = `tex/hairflow-${n}.webp`;
  await sharp(flow, { raw: { width: info.width, height: info.height, channels: 3 } }).resize(512, 512).webp({ lossless: true, effort: 5 }).toFile(`${OUT}/${maps.flow}`);
  const alphaAt = (u, v) => px[(Math.min(info.height - 1, Math.max(0, Math.floor((1 - v) * info.height))) * info.width + Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)))) * 4 + 3] / 255;
  await proxy('hair', n, {
    label, geom: npmDir('hair', n), clo: `${DEB}/hair/${n}/${n}.mhclo`, maps, alpha: true, cull: false, extra: { mean: await meanColor(src) },
    bake: ({ c, r }) => ({ ao: hairAO({ pos: restProxy(c), index: r.idx, map: r.map, uv: r.uv, alphaAt, body: { pos: P0, index: bodyTris }, center: headCenter }) }),
  });
  log('hair', n);
}
// 衣服（整套）、鞋、帽子
const OUTFIT = {
  male_casualsuit06: ['白 T 恤牛仔裤', 'm'], male_casualsuit04: ['蓝 T 恤牛仔裤', 'm'], male_casualsuit02: ['长袖 T 恤牛仔裤', 'm'], male_casualsuit01: ['衬衫牛仔裤', 'm'],
  male_casualsuit03: ['条纹衬衫牛仔裤', 'm'], male_casualsuit05: ['夹克牛仔裤', 'm'], male_elegantsuit01: ['黑西装', 'm'],
  // male_worksuit01（工装背带裤）不收：npm 包里那份网格和 1.1.1 的 .mhclo 不是同一个版本（uuid 不同），顶点对不上
  female_casualsuit01: ['T 恤牛仔裤', 'f'], female_casualsuit02: ['T 恤热裤', 'f'], female_elegantsuit01: ['条纹衬衫半裙', 'f'], female_sportsuit01: ['运动背心紧身裤', 'f'],
};
// T 恤上的 MakeHuman 标志：框（2048 的贴图上的像素）里和布的颜色差得多的像素算标志，从 from 偏移处搬干净的布过来
const LOGOS = {
  male_casualsuit02: [{ box: [1010, 225, 1285, 495], from: [0, 300] }],
  male_casualsuit04: [{ box: [1010, 225, 1285, 495], from: [0, 255] }],
  male_casualsuit06: [{ box: [815, 245, 1295, 425], from: [0, 260] }, { box: [395, 245, 615, 340], from: [0, 260] }, { box: [1490, 300, 1560, 380], from: [0, 120] }],
  female_casualsuit01: [{ box: [1455, 300, 1770, 645], from: [-330, 0] }],
  female_casualsuit02: [{ box: [1455, 300, 1770, 645], from: [-330, 0] }],
};
// 配色：每套分几个部位（按裁片在身上的高度分上衣 / 下装；西装、帽子整件一个部位），每个部位可以换颜色。
// 种类决定权重图的宽严：牛仔布洗白的地方更亮、更灰，放宽才能一起换色
const PARTS = {
  male_casualsuit06: [['T 恤', 'top'], ['牛仔裤', 'denim']], male_casualsuit04: [['T 恤', 'top'], ['牛仔裤', 'denim']],
  male_casualsuit02: [['长袖 T 恤', 'top'], ['牛仔裤', 'denim']], male_casualsuit01: [['衬衫', 'top'], ['牛仔裤', 'denim']],
  male_casualsuit03: [['条纹衬衫', 'top'], ['牛仔裤', 'denim']], male_casualsuit05: [['夹克', 'top'], ['牛仔裤', 'denim']],
  male_elegantsuit01: [['西装', 'suit']],
  female_casualsuit01: [['T 恤', 'top'], ['牛仔裤', 'denim']], female_casualsuit02: [['T 恤', 'top'], ['热裤', 'denim']],
  female_elegantsuit01: [['衬衫', 'top'], ['半裙', 'bottom']], female_sportsuit01: [['运动背心', 'top'], ['紧身裤', 'bottom']],
  fedora01: [['礼帽', 'hat']],
};
const KIND = { top: { tol: 0.07, qmax: 3.3 }, denim: { tol: 0.15, qmax: 7 }, bottom: { tol: 0.08, qmax: 3.3 }, suit: { tol: 0.07, qmax: 3.3 }, hat: { tol: 0.07, qmax: 3.3 } };
// texCloth 的 onData：算部位、主色和权重图（size²，R/G/B = 部位 0/1/2，无损 WebP），结果放进 out
const partsJob = (n, clo, out, size = 1024) => async (rgba, W, H, r) => {
  const def = PARTS[n], isl = islands(r), cls = classify(r, restProxy(parseMhclo(clo)), isl);
  const triPart = Int8Array.from(isl.triIsl, (k) => Math.min(cls[k], def.length - 1));
  size = Math.min(size, W);
  const { mask, dom } = partMask(rgba, W, H, r, triPart, def.length, { tol: def.map(([, k]) => KIND[k].tol), qmax: def.map(([, k]) => KIND[k].qmax), out: size });
  out.file = `tex/cloth-${n}-parts.webp`;
  await sharp(Buffer.from(mask), { raw: { width: size, height: size, channels: 3 } }).webp({ lossless: true, effort: 5 }).toFile(`${OUT}/${out.file}`);
  out.parts = def.map(([label, kind], p) => ({ label, kind, dom: dom[p] }));
};
for (const [n, [label, sex]] of Object.entries(OUTFIT)) {
  const mm = mat('clothes', n), clo = `${DEB}/clothes/${n}/${n}.mhclo`, pj = {};
  const maps = { map: await texCloth(`${mm.dir}/${mm.diffuseTexture}`, `cloth-${n}`, 2048, { q: 80, geom: npmDir('clothes', n), logos: LOGOS[n] ?? [], onData: partsJob(n, clo, pj) }) };
  if (mm.normalmapTexture) maps.normal = tex(`${mm.dir}/${mm.normalmapTexture}`, `cloth-${n}-n`, 1024, { q: 85 });
  if (mm.aomapTexture) maps.ao = tex(`${mm.dir}/${mm.aomapTexture}`, `cloth-${n}-ao`, 512, { q: 80 });
  maps.parts = pj.file;
  await proxy('outfit', n, { label, geom: npmDir('clothes', n), clo, maps, extra: { sex, parts: pj.parts } });
  log('outfit', n, pj.parts.map((x) => `${x.label} ${x.dom.map((v) => Math.round(255 * v ** (1 / 2.2))).join(',')}`).join(' / '));
}
const SHOES = { shoes05: '白色运动鞋', shoes06: '蓝色运动鞋', shoes02: '旧帆布鞋', shoes01: '棕色皮鞋', shoes04: '棕色休闲鞋', shoes03: '黑色皮鞋' };
for (const [n, label] of Object.entries(SHOES)) {
  const mm = mat('clothes', n);
  const maps = { map: await texCloth(`${mm.dir}/${mm.diffuseTexture}`, `shoe-${n}`, 1024, { q: 84, geom: npmDir('clothes', n) }) };
  if (mm.normalmapTexture) maps.normal = tex(`${mm.dir}/${mm.normalmapTexture}`, `shoe-${n}-n`, 1024, { q: 85 });
  await proxy('shoes', n, { label, geom: npmDir('clothes', n), clo: `${DEB}/clothes/${n}/${n}.mhclo`, maps });
}
{
  const cf = `${DEB}/clothes/fedora01/fedora.mhclo`, clo = parseMhclo(cf), pj = {};
  const mm = parseMhmat(`${DEB}/clothes/fedora01/${clo.material}`);
  const maps = { map: await texCloth(`${mm.dir}/${mm.diffuseTexture}`, 'hat-fedora01', 1024, { q: 84, geom: npmDir('clothes', 'fedora'), onData: partsJob('fedora01', cf, pj, 512) }) };
  if (mm.normalmapTexture) maps.normal = tex(`${mm.dir}/${mm.normalmapTexture}`, 'hat-fedora01-n', 512, { q: 85 });
  maps.parts = pj.file;
  await proxy('hat', 'fedora01', { label: '礼帽', geom: npmDir('clothes', 'fedora'), clo: cf, maps, extra: { parts: pj.parts } });
}
meta.proxies = proxies;
log('proxies', proxies.length, 'raw', (proxies.reduce((s2, p) => s2 + p.bytes, 0) / 1e6).toFixed(2), 'MB');

// —— 皮肤：年轻 / 中年 / 老年 × 白 / 亚 / 黑 × 男 / 女 ——
meta.skins = {};
for (const f of fs.readdirSync(`${DEB}/skins`)) {
  const mf = `${DEB}/skins/${f}/${f}.mhmat`;
  if (!fs.existsSync(mf) || f === 'toon01' || f.includes('special')) continue;
  const mm = parseMhmat(mf);
  meta.skins[f] = tex(`${DEB}/skins/${mm.diffuseTexture.replace('../', '')}`, `skin-${f}`, 2048, { q: 84 });
}
for (const f of ['young_caucasian_female2', 'young_caucasian_male2']) {
  const mm = parseMhmat(`${DEB}/skins/${f.replace('2', '')}/${f}.mhmat`);
  meta.skins[f] = tex(`${DEB}/skins/${mm.diffuseTexture.replace('../', '')}`, `skin-${f}`, 2048, { q: 84 });
}
await Promise.all(texJobs);
const texBytes = fs.readdirSync(`${OUT}/tex`).reduce((s2, f) => s2 + fs.statSync(`${OUT}/tex/${f}`).size, 0);
log('textures', fs.readdirSync(`${OUT}/tex`).length, (texBytes / 1e6).toFixed(2), 'MB');

// —— 脸部遮罩（UV 空间，1024²）：R 胡子、G 腮红 / 雀斑、B 嘴唇、A 眼睑（眼影、眼线）——
//   在基础网格上按三维位置和表情单元的位移算出每个顶点的值，再按 UV 光栅化。跟拓扑走，任何体型都对得上
{
  const V = base.v; // 分米
  const isBody = new Uint8Array(NV);
  for (const f of base.faces) if (f.group === 'body') for (const v of f.v) isBody[v] = 1;
  const mean = (vs) => { const o = [0, 0, 0]; for (const v of vs) for (let a = 0; a < 3; a++) o[a] += V[v * 3 + a] / vs.length; return o; };
  const eyeL = mean(SKEL.joints['eye.L____head']), eyeR = mean(SKEL.joints['eye.R____head']);
  const unit = (name) => { const t = parseTarget(`${GH}/targets/expression/units/caucasian/${name}.target`); const m = new Float32Array(NV); let mx = 0; for (let i = 0; i < t.idx.length; i++) { const d = Math.hypot(t.d[i * 3], t.d[i * 3 + 1], t.d[i * 3 + 2]); m[t.idx[i]] = d; mx = Math.max(mx, d); } for (let i = 0; i < NV; i++) m[i] /= mx || 1; return m; };
  const purse = unit('mouth-pursing'), evert = unit('mouth-eversion'), closeL = unit('eye-left-closure'), closeR = unit('eye-right-closure');
  // 嘴唇：撅嘴 / 外翻时动得多的点
  const lipsV = [];
  for (let v = 0; v < NV; v++) if (isBody[v] && Math.max(purse[v], evert[v]) > 0.45) lipsV.push(v);
  const mouth = mean(lipsV);
  const eyeY = (eyeL[1] + eyeR[1]) / 2, eyeZ = (eyeL[2] + eyeR[2]) / 2;
  // 鼻尖：两眼和嘴之间、靠中线、最靠前的点；下巴：嘴下面、靠中线、靠前的点里最低的
  let nose = null, chin = null;
  for (let v = 0; v < NV; v++) {
    if (!isBody[v]) continue;
    const x = V[v * 3], y = V[v * 3 + 1], z = V[v * 3 + 2];
    if (Math.abs(x) < 0.08 && y < eyeY && y > mouth[1] && (!nose || z > nose[2])) nose = [x, y, z];
    if (Math.abs(x) < 0.08 && y < mouth[1] - 0.25 && y > mouth[1] - 0.75 && (!chin || z > chin[2])) chin = [x, y, z];
  }
  chin[1] -= 0.2; // 下巴最突出的点往下 2cm 是下巴底
  const zc = eyeZ - 0.95; // 头的竖轴（眼睛后面约 9.5cm）
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const val = new Float32Array(NV * 4);
  for (let v = 0; v < NV; v++) {
    if (!isBody[v]) continue;
    const x = V[v * 3], y = V[v * 3 + 1], z = V[v * 3 + 2];
    const th = Math.abs(Math.atan2(x, z - zc)) * 180 / Math.PI; // 0 = 正前方
    const lips = sm(0.45, 0.8, Math.max(purse[v], evert[v])) * sm(110, 70, th);
    // 胡子：鼻子下面（上唇的小胡子）到下巴底下一点，两侧顺着下颌到耳朵（鬓角往上一点）；不含嘴唇
    const top = nose[1] - 0.07 + 0.5 * sm(45, 95, th);
    const beard = sm(top + 0.03, top - 0.05, y) * sm(chin[1] - 0.32, chin[1] - 0.08, y) * sm(112, 92, th) * (1 - sm(0.3, 0.6, lips));
    // 腮红 + 雀斑：两颊苹果肌一片，中间连过鼻梁
    const cheek = Math.exp(-(((Math.abs(x) - 0.4) / 0.22) ** 2 + ((y - (eyeY - 0.36)) / 0.17) ** 2)) * sm(80, 50, th);
    const bridge = Math.exp(-((x / 0.12) ** 2 + ((y - (eyeY - 0.2)) / 0.1) ** 2)) * 0.3;
    const blush = Math.max(cheek, bridge) * (1 - lips);
    // 眼睑：闭眼时动的地方（上眼皮），再加眼窝上方一片（眼影）
    const lid = Math.max(closeL[v], closeR[v]);
    const ex = x > 0 ? eyeL[0] : eyeR[0];
    const socket = Math.exp(-(((x - ex) / 0.3) ** 2 + ((y - (eyeY + 0.1)) / 0.15) ** 2)) * sm(eyeY - 0.06, eyeY + 0.02, y) * sm(80, 55, th);
    const eyeA = Math.max(sm(0.15, 0.85, lid) * sm(eyeY - 0.08, eyeY - 0.01, y), socket * 0.55);
    val.set([beard, blush, lips, eyeA], v * 4);
  }
  // 光栅化到 UV（身体的渲染网格：每个三角形三个渲染点，UV + 基础顶点号）
  const S2 = 1024, img = new Float32Array(S2 * S2 * 4), cov = new Uint8Array(S2 * S2);
  const U = body.uv, IDX = body.idx, MAP = body.map;
  for (let t = 0; t < IDX.length; t += 3) {
    const r = [IDX[t], IDX[t + 1], IDX[t + 2]];
    const pu = r.map((i) => U[i * 2] * S2), pv = r.map((i) => (1 - U[i * 2 + 1]) * S2);
    const x0 = Math.max(0, Math.floor(Math.min(...pu))), x1 = Math.min(S2 - 1, Math.ceil(Math.max(...pu))), y0 = Math.max(0, Math.floor(Math.min(...pv))), y1 = Math.min(S2 - 1, Math.ceil(Math.max(...pv)));
    const den = (pv[1] - pv[2]) * (pu[0] - pu[2]) + (pu[2] - pu[1]) * (pv[0] - pv[2]);
    if (Math.abs(den) < 1e-9) continue;
    const vals = r.map((i) => val.subarray(MAP[i] * 4, MAP[i] * 4 + 4));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = ((pv[1] - pv[2]) * (px - pu[2]) + (pu[2] - pu[1]) * (py - pv[2])) / den;
      const b = ((pv[2] - pv[0]) * (px - pu[2]) + (pu[0] - pu[2]) * (py - pv[2])) / den;
      const c = 1 - a - b;
      if (a < -0.02 || b < -0.02 || c < -0.02) continue;
      const o = (y * S2 + x) * 4;
      for (let k = 0; k < 4; k++) img[o + k] = vals[0][k] * a + vals[1][k] * b + vals[2][k] * c;
      cov[y * S2 + x] = 1;
    }
  }
  // 往外扩几圈（UV 接缝处取样不会漏）
  for (let pass = 0; pass < 4; pass++) {
    const nc = cov.slice();
    for (let y = 1; y < S2 - 1; y++) for (let x = 1; x < S2 - 1; x++) {
      if (cov[y * S2 + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = (y + dy) * S2 + x + dx;
        if (cov[q]) { for (let k = 0; k < 4; k++) img[(y * S2 + x) * 4 + k] = img[q * 4 + k]; nc[y * S2 + x] = 1; break; }
      }
    }
    cov.set(nc);
  }
  // 不用 alpha 通道（浏览器解码图片时会预乘 alpha，alpha = 0 的地方 RGB 就丢了）：RGB 一张（胡子、腮红、嘴唇），眼睑单独一张灰度
  const rgb = new Uint8Array(S2 * S2 * 3), gray = new Uint8Array(S2 * S2 * 3);
  const q8 = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  for (let i = 0; i < S2 * S2; i++) {
    rgb[i * 3] = q8(img[i * 4]); rgb[i * 3 + 1] = q8(img[i * 4 + 1]); rgb[i * 3 + 2] = q8(img[i * 4 + 2]);
    gray[i * 3] = gray[i * 3 + 1] = gray[i * 3 + 2] = q8(img[i * 4 + 3]);
  }
  texJobs.push(sharp(Buffer.from(rgb), { raw: { width: S2, height: S2, channels: 3 } }).webp({ lossless: true, effort: 6 }).toFile(`${OUT}/tex/facemask.webp`));
  texJobs.push(sharp(Buffer.from(gray), { raw: { width: S2, height: S2, channels: 3 } }).resize(512, 512).webp({ lossless: true, effort: 6 }).toFile(`${OUT}/tex/eyemask.webp`));
  await Promise.all(texJobs);
  log('face mask: lips', lipsV.length, 'verts; nose', nose.map((x) => x.toFixed(2)), 'chin', chin.map((x) => x.toFixed(2)));
}

const size = blob.size;
fs.writeFileSync(`${OUT}/human.bin`, zlib.gzipSync(Buffer.concat(blob.parts), { level: 9 }));
fs.writeFileSync(`${OUT}/human.json`, JSON.stringify(meta));
log('human.bin', (size / 1e6).toFixed(2), 'MB raw,', (fs.statSync(`${OUT}/human.bin`).size / 1e6).toFixed(2), 'MB gz; json', (fs.statSync(`${OUT}/human.json`).size / 1e3).toFixed(0), 'KB');
