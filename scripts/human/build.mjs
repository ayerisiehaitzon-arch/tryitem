// 把 MakeHuman（CC0）的资源转成网页用的紧凑数据：viewer/human/（npm run build-human）
// 素材默认从 scripts/human/fetch.sh 下载到的 .cache/human-src/ 里读，也可以用环境变量指到别处：
//   MH_GH  = makehumancommunity/makehuman 仓库里的 makehuman/data（基础网格、形变目标、默认骨骼和权重、眼球，全是文本）
//   MH_DEB = MakeHuman 1.1.1 的资源目录（Ubuntu 的 makehuman-data 包解开后的 usr/share/makehuman/data：皮肤、头发、衣服、眉毛、睫毛的贴图和 .mhclo）
//   MH_NPM = npm 包 makehuman-data 的 public/data（头发、衣服等代理网格的 JSON 版，和 .mhclo 一一对应）
//   MH_PACKS = MakeHuman 社区资源包里用到的头发和衣服（hair/<名字>/、clothes/<名字>/ 下的 .mhclo、.obj、.mhmat、贴图，packs/<包>.json 记作者和许可）
// 只读文本和图片，不碰任何二进制归档（.npz）。动作另由 anims.mjs 生成。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { parseObj, parseTarget, parseMhclo, parseMhmat, parseThreeJson } from './mhparse.mjs';
import { flowMap, removeLogo, uvCoverage, edgePad } from './texfx.mjs';
import { hairAO } from './hairao.mjs';
import { islands, classify, classifyShoe, partMask } from './parts.mjs';
import { decimate } from './decimate.mjs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = fileURLToPath(new URL('../..', import.meta.url)), SRC = path.join(ROOT, '.cache/human-src');
const GH = process.env.MH_GH ?? `${SRC}/makehuman/makehuman/data`;
const DEB = process.env.MH_DEB ?? `${SRC}/deb/usr/share/makehuman/data`;
const NPM = process.env.MH_NPM ?? `${SRC}/npm/package/public/data`;
const PACKS = process.env.MH_PACKS ?? `${SRC}/packs`;
const OUT = process.env.OUT ?? path.join(ROOT, 'viewer/human');
for (const [k, d] of [['MH_GH', GH], ['MH_DEB', DEB], ['MH_NPM', NPM], ['MH_PACKS', PACKS]]) {
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

// 把网格上的一道开口缝起来：a、b 是开口两边的顶点，从顶上的尖往下一一对着（第一个是两边共用的尖），对着的两个点连成一条窄带，
// 不加顶点（贴合数据不用动）。窄带的 UV 用 a 边的，b 边的点取 a 边对应的点往 a 边那片布的里面挪（挪多远按两点在 3D 里隔多远、
// 这片布的 UV 密度算），采到的是开口旁边的布；绕向和开口两边的面一致
function stitch(g, a, b) {
  const P = (v) => [g.v[v * 3], g.v[v * 3 + 1], g.v[v * 3 + 2]], dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const uvs = (v) => [...new Set(g.faces.flatMap((f) => f.v.map((x, k) => (x === v ? f.t[k] : -1)).filter((t) => t >= 0)))];
  const U = (t) => [g.vt[t * 2], g.vt[t * 2 + 1]];
  // a 边每个点用哪个 UV（尖上有两个：取离 a 边下一个点近的那个）
  const ta = a.map((v) => uvs(v));
  for (const [i, ts] of ta.entries()) if (ts.length !== 1 && i > 0) throw new Error(`stitch: ${a[i]} 有 ${ts.length} 个 UV`);
  const near = U(ta[1][0]);
  ta[0] = [ta[0].sort((p, q) => Math.hypot(...U(p).map((x, k) => x - near[k])) - Math.hypot(...U(q).map((x, k) => x - near[k])))[0]];
  const t0 = ta.map((x) => x[0]);
  // UV 密度、往布里面挪的方向（a 边的垂线，指向 a 边两侧的面上其余顶点的 UV 中心）
  const n = a.length - 1, s = Math.hypot(...U(t0[n]).map((x, k) => x - U(t0[1])[k])) / dist(P(a[n]), P(a[1]));
  const da = U(t0[n]).map((x, k) => x - U(t0[1])[k]), dl = Math.hypot(...da), perp = [-da[1] / dl, da[0] / dl];
  const c = [0, 0]; let m = 0;
  for (const f of g.faces) if (f.v.some((v) => a.includes(v))) for (const [k, v] of f.v.entries()) if (!a.includes(v)) { c[0] += g.vt[f.t[k] * 2]; c[1] += g.vt[f.t[k] * 2 + 1]; m++; }
  const mid = U(t0[Math.floor(n / 2)]), side = Math.sign((c[0] / m - mid[0]) * perp[0] + (c[1] / m - mid[1]) * perp[1]);
  const vt = Array.from(g.vt), tb = b.map((v, i) => {
    if (i === 0) return t0[0];
    const d = dist(P(v), P(a[i])) * s, uv = U(t0[i]);
    vt.push(uv[0] + perp[0] * side * d, uv[1] + perp[1] * side * d);
    return vt.length / 2 - 1;
  });
  g.vt = Float32Array.from(vt);
  // 绕向：开口 a 边上的边 a[i] → a[i+1] 在原来的面里是哪个方向，新面里反过来
  const dir = g.faces.some((f) => f.v.some((v, k) => v === a[1] && f.v[(k + 1) % f.v.length] === a[2]));
  const add = (vs, ts) => g.faces.push(dir ? { v: vs, t: ts } : { v: [...vs].reverse(), t: [...ts].reverse() });
  add([a[1], a[0], b[1]], [t0[1], t0[0], tb[1]]);
  for (let i = 1; i < n; i++) add([a[i + 1], a[i], b[i], b[i + 1]], [t0[i + 1], t0[i], tb[i], tb[i + 1]]);
  return g;
}
// 网格要修一下的（按“目录/文件名”）：
//   条纹衬衫半裙（拆出来的半裙也是这张网格）的半裙后面开着一道 17cm 高的衩，左右两片各跟各的腿走——
//   站着时两腿一分开，衩口张成一个方形的缺口，像短裤；走路时一片跟着大腿甩到前面，露出一块皮肤。缝上，变成一条直筒裙；
//   面数多的鞋减面（decimate.mjs）：凉拖 2.3 万个三角形（UV 拆成两百多片，接缝上的点折不动，减到八千多就停了），
//   拼色、编织平底鞋 1.6 万减到 5000，机车靴、蝴蝶结芭蕾鞋、孟克鞋 1.3 ~ 1.6 万减到 6000；轮廓、接缝不动，看不出差别
const GEOM_FIX = {
  'female_elegantsuit01/female_elegantsuit01.json': (g) => stitch(g, [323, 131, 144, 157, 170, 183], [323, 337, 351, 365, 379, 393]),
  'elvs_male_flip_flop_sandals1/maleflipflops1.obj': (g) => decimate(g, 6000),
  'elvs_flatshoe_pointy1/elvs_basic_flatshoe2.obj': (g) => decimate(g, 5000),
  'elvs_flatshoe_plain1/elvs_basic_flatshoe2a.obj': (g) => decimate(g, 5000),
  'mindfront_shoes_biker_boots_male/shoes_biker_boots_male.obj': (g) => decimate(g, 6000),
  'toigo_ballet_flats_with_bows/flats_ballet_bow.obj': (g) => decimate(g, 6000),
  'mindfront_shoes_monk_strap_male/shoes_monk_strap_male.obj': (g) => decimate(g, 6000),
};
// 代理的网格：.obj 或 npm 包里的 three JSON，GEOM_FIX 里有的顺手修好
const readGeom = (file) => {
  const g = file.endsWith('.obj') ? parseObj(file) : parseThreeJson(file);
  GEOM_FIX[`${path.basename(path.dirname(file))}/${path.basename(file)}`]?.(g);
  return g;
};

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
// 材质里写成 bumpTexture 的图：有的其实就是法线贴图（偏蓝紫，平均色接近 128,128,255），原样用；
// 真的是凹凸（灰度的高度）的，算成法线贴图——先缩到 size，按相邻像素的高度差求斜率，
// 强度定成“九成像素的斜率不超过 0.35”（每张图的灰度范围不一样，固定的系数有的太平、有的太陡）
async function bumpTex(src, name, size, { q = 85 } = {}) {
  const { data, info } = await sharp(src).removeAlpha().resize(size, size, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const n = size * size, C = info.channels, mean = [0, 1, 2].map((c) => { let s = 0; for (let i = 0; i < n; i++) s += data[i * C + c]; return s / n; });
  if (mean[2] > 180 && Math.abs(mean[0] - 128) < 40 && Math.abs(mean[1] - 128) < 40) return tex(src, name, size, { q });
  const h = Float32Array.from({ length: n }, (_, i) => (0.2126 * data[i * C] + 0.7152 * data[i * C + 1] + 0.0722 * data[i * C + 2]) / 255);
  const at = (x, y) => h[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  const gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { gx[y * size + x] = (at(x + 1, y) - at(x - 1, y)) / 2; gy[y * size + x] = (at(x, y + 1) - at(x, y - 1)) / 2; }
  const mag = Float32Array.from(gx, (v, i) => Math.hypot(v, gy[i])).sort();
  const k = Math.min(40, 0.35 / Math.max(1e-4, mag[Math.floor(n * 0.9)]));
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    // 图上往下是 V 变小：法线的 y 分量（朝 V 增大的方向）取 +gy
    const nx = -gx[i] * k, ny = gy[i] * k, l = Math.hypot(nx, ny, 1);
    out[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); out[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); out[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
  }
  const dst = `tex/${name}.webp`;
  texJobs.push(sharp(out, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: q, effort: 5 }).toFile(`${OUT}/${dst}`));
  return dst;
}
// 高光贴图（spec，亮 = 亮面）换成粗糙度贴图（G 通道，three.js 的 roughnessMap 读这个）：粗糙度 = 0.8 − 0.42 × 高光
async function specRough(src, name, size, { q = 85 } = {}) {
  const { data, info } = await sharp(src).removeAlpha().resize(size, size, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const L = (0.2126 * data[i * info.channels] + 0.7152 * data[i * info.channels + 1] + 0.0722 * data[i * info.channels + 2]) / 255;
    out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = Math.round((0.8 - 0.42 * L) * 255);
  }
  const dst = `tex/${name}.webp`;
  texJobs.push(sharp(out, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: q, effort: 5 }).toFile(`${OUT}/${dst}`));
  return dst;
}
// 衣服、鞋、帽子的贴图：去标志 → UV 岛往外填色（缩小、mipmap 时接缝不会漏进黑色或白色的底）→ 缩小 → WebP
// onData(rgba, W, H, r)：拿处理好的原尺寸贴图再做点别的（比如配色的权重图）
async function texCloth(src, name, size, { q = 80, geom = null, logos = [], onData = null } = {}) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, k = W / 2048;
  for (const L of logos) removeLogo(data, W, H, { ...L, box: L.box.map((x) => Math.round(x * k)), from: L.from.map((x) => Math.round(x * k)) });
  if (geom) {
    const r = renderMesh(readGeom(geom));
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
// clo：.mhclo 的路径，或者已经读好的贴合数据（npmClo）
// keep(三角形序号)：只要其中一部分三角形（把整套拆成上衣、下装），用到的渲染顶点、代理顶点重新编号，贴合数据跟着取；
// del：这一件自己的 delete_verts（拆开的两件各藏各的）
async function proxy(cat, name, { label, geom, clo, maps, alpha = false, cull = true, extra = {}, split = null, bake = null, keep = null, del = null }) {
  const g = readGeom(geom);
  let c = typeof clo === 'string' ? parseMhclo(clo) : clo;
  const uuidOf = (f) => (typeof f === 'string' ? fs.readFileSync(f, 'utf8').match(/^uuid\s+(\S+)/m)?.[1] : f.uuid);
  if (g.meta?.uuid && uuidOf(clo) && g.meta.uuid !== uuidOf(clo)) throw new Error(`${name}: 网格和贴合数据不是同一版（uuid ${g.meta.uuid} ≠ ${uuidOf(clo)}）`);
  let nv = c.ref.length / 3;
  if (g.v.length / 3 !== nv) throw new Error(`${name}: 顶点数对不上 ${g.v.length / 3} vs ${nv}`);
  let r = renderMesh(g);
  // 减过面的网格有用不到的顶点：和拆单件一样重新编号，贴合数据只留用到的
  if (g.decimated) keep ??= () => true;
  if (keep) {
    const rid = new Map(), pid = new Map(), map = [], uv = [], idx = [], pv = [];
    for (let t = 0; t < r.idx.length; t += 3) {
      if (!keep(t / 3)) continue;
      for (let j = 0; j < 3; j++) {
        const o = r.idx[t + j];
        if (!rid.has(o)) {
          const v = r.map[o];
          if (!pid.has(v)) { pid.set(v, pv.length); pv.push(v); }
          rid.set(o, map.length); map.push(pid.get(v)); uv.push(r.uv[o * 2], r.uv[o * 2 + 1]);
        }
        idx.push(rid.get(o));
      }
    }
    const pick = (a) => pv.flatMap((v) => [a[v * 3], a[v * 3 + 1], a[v * 3 + 2]]);
    r = { map, uv, idx };
    c = { ...c, ref: pick(c.ref), w: pick(c.w), off: pick(c.off) };
    nv = pv.length;
  }
  if (del) c = { ...c, del };
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
// 只在 npm 包里有的社区资源没有 .mhclo：贴合数据就在 JSON 里（和 .mhclo 一样的单位和顺序，礼帽两份逐项核对过相同），
// 只缺三个方向的缩放参考（偏移跟着身体尺寸缩放用），由调用的人给（帽子都借礼帽的：头的宽、高、深）
function npmClo(cat, name, scale) {
  const j = JSON.parse(fs.readFileSync(npmDir(cat, name), 'utf8'));
  const three = (a, f) => a.flatMap((x) => (Array.isArray(x) ? x : f(x)));
  return {
    uuid: j.metadata.uuid, name, scale, zDepth: j.metadata.z_depth ?? 50,
    ref: three(j.ref_vIdxs, (v) => [v, v, v]), w: three(j.weights, () => [1, 0, 0]), off: three(j.offsets, () => [0, 0, 0]),
    del: j.metadata.deleteVerts.flatMap((d, i) => (d ? [i] : [])),
  };
}

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
// MakeHuman 社区资源包（files.makehumancommunity.org/asset_packs，fetch.sh 下载）里的头发、衣服：每件是作者原版的 .mhclo（贴合数据、缩放参考）
// + .obj + .mhmat + 贴图，作者、许可、来源页从包里的 packs/<包>.json 读
const packInfo = {};
for (const f of fs.readdirSync(`${PACKS}/packs`)) Object.assign(packInfo, JSON.parse(fs.readFileSync(`${PACKS}/packs/${f}`, 'utf8')));
// 文件名大小写不一定和 .mhclo、.mhmat 里写的一样
const packFile = (dir, rel) => rel.split('/').reduce((d, seg) => {
  const hit = fs.readdirSync(d).find((f) => f.toLowerCase() === seg.toLowerCase());
  if (!hit) throw new Error(`${d} 里没有 ${seg}`);
  return `${d}/${hit}`;
}, dir);
// kind：clothes 或 hair。没写 material 的（报童帽）用目录里唯一的那个 .mhmat；
// 许可按包里的清单，CC BY 的版本号写在 .mhclo 开头的注释里（有的写了）。有的 .mhclo 注释里写着 AGPL3，那是 MakeClothes 导出时默认填的，不算数
function packItem(kind, src) {
  const dir = `${PACKS}/${kind}/${src}`, file = packFile(dir, `${src}.mhclo`), clo = parseMhclo(file);
  const mm = parseMhmat(packFile(dir, clo.material ?? fs.readdirSync(dir).find((f) => f.endsWith('.mhmat'))));
  const ver = fs.readFileSync(file, 'utf8').match(/^#\s*license:?\s*cc[\s_-]*by\s*(\d\.\d)/im)?.[1], lic = packInfo[src].license;
  const credit = { author: packInfo[src].author, license: lic.replace(/^CC-BY$/, 'CC BY') + (ver && lic === 'CC-BY' ? ` ${ver}` : ''), url: packInfo[src].source };
  return { dir, clo, geom: packFile(dir, clo.obj), mm, credit };
}

// 头发：MakeHuman 自带的 10 款（网格用 npm 包里的 JSON，.mhclo 和贴图从 Ubuntu 包里取）。
// 第二项是男女（m 男款，f 女款，u 都行），网页里按它排序、随机
const HAIR = {
  short04: ['平头', 'm'], short02: ['碎短发', 'm'], short01: ['短发', 'u'], short03: ['女式短发', 'u'], bob02: ['齐耳短发', 'f'], bob01: ['斜刘海波波头', 'f'],
  long01: ['长直发', 'f'], ponytail01: ['马尾', 'f'], braid01: ['麻花辫', 'f'], afro01: ['爆炸头', 'u'],
};
// 资源包里的发型：id → [包里的目录, 名字, 男女]。每款都在男女几种身材上、几段动作里、戴帽子时看过；
// 没收的：几款低多边形的卡通发型（cortu 的几款、culturalibre 的卡通头）；遮住半张脸的卷发波波头；染色后发片斑驳的狼尾长发和学生头（o4saken）；
// 和已经收了的太像的（MargaretToigo 的六款波波头只留三款，Elvaerwyn 用 MakeHuman 麻花辫改的几款只留双麻花辫）；
// 原作者不明、许可说不清的（MakeHuman alpha 7 的几款旧发型改的、Sketchfab 上转来的）
const HAIR_PACK = {
  male02: ['culturalibre_hair_02', '纹理短发', 'm'],
  maxwell: ['elvs_maxwell_hair', '刺猬头', 'm'],
  grump: ['elvs_grump_hair', '三七分', 'm'],
  keylth: ['elvs_keylth_hair', '半扎发', 'u'],
  tousled: ['elvs_that_80s_babe_hair', '蓬松长发', 'u'],
  jungle: ['sonntag78_junglebook_hair', '中长碎发', 'u'],
  cornrows: ['elvs_braided_rows', '玉米辫', 'u'],
  afro_puffs: ['elvs_micky_afro', '双丸子头', 'f'],
  blunt_bob: ['toigo_blunt_bob_with_bangs', '齐刘海波波头', 'f'],
  curled_bob: ['toigo_curled_under_bob', '内扣短发', 'f'],
  inverted_bob: ['toigo_inverted_bob', '前长后短波波头', 'f'],
  updo50s: ['elvs_50s_updo', '复古盘发', 'f'],
  adrienne: ['elvs_adrienne_hair', '侧分长卷发', 'f'],
  ashley: ['elvs_ashley_may_hair', '羽毛剪', 'f'],
  braid_bun: ['elvs_braid_bun', '编发丸子头', 'f'],
  daisy: ['elvs_short_daisy_hair', '中长发', 'f'],
  hazel: ['elvs_hazel_hair', '长波浪', 'f'],
  island: ['elvs_island_princess_hair', '公主头', 'f'],
  katherine: ['elvs_katherine_hair', '斜刘海中长发', 'f'],
  lara: ['elvs_lara_hair', '长辫子', 'f'],
  double_braid: ['elvs_double_mh_braid', '双麻花辫', 'f'],
  bun: ['rehmanpolanski_hair_bun_brown', '发髻', 'f'],
};
// 发色、眉色可以染：记下贴图里不透明部分的平均亮度和颜色，网页里按“亮度 / 平均亮度 × 染的颜色”重新上色
async function meanColor(file) {
  const { data, info } = await sharp(file).resize(256, 256).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g2 = 0, b = 0, n = 0;
  for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] > 160) { r += data[i * 4]; g2 += data[i * 4 + 1]; b += data[i * 4 + 2]; n++; }
  const lin = (x) => ((x / n / 255) <= 0.04045 ? x / n / 255 / 12.92 : ((x / n / 255 + 0.055) / 1.055) ** 2.4);
  const c = [lin(r), lin(g2), lin(b)];
  return { rgb: c.map((x) => +x.toFixed(4)), lum: +(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).toFixed(4) };
}
// 胡子总是染色（网页里跟着发色或者选的颜色），贴图只管明暗层次。有几款的贴图几乎是黑的（不透明部分的平均亮度不到 0.05，
// 达利胡干脆全黑，形状全在 alpha 里），存成 WebP 以后层次就没了，染出来也发黑：先把颜色按比例提亮，提到平均亮度 0.18（线性；
// 亮的发丝提过头会截在 1，比例用二分法找，让截过以后的平均正好是 0.18）
async function brighten(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const lin = (x) => (x / 255 <= 0.04045 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
  const srgb = (x) => Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055));
  const px = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 160) px.push([lin(data[i]), lin(data[i + 1]), lin(data[i + 2])]);
  const mean = (k) => px.reduce((s, [r, g, b]) => s + 0.2126 * Math.min(1, r * k) + 0.7152 * Math.min(1, g * k) + 0.0722 * Math.min(1, b * k), 0) / (px.length || 1);
  if (mean(1) >= 0.05) return src;
  let k = 0;
  if (mean(1e4) > 0.18) {
    let lo = 1, hi = 1e4;
    for (let it = 0; it < 40; it++) { const mid = Math.sqrt(lo * hi); if (mean(mid) < 0.18) lo = mid; else hi = mid; }
    k = lo;
  }
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = k ? srgb(Math.min(1, lin(data[i + c]) * k)) : srgb(0.18);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
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
// 一款头发（胡子也一样，cat 换成 beard、moustache）：贴图（带 alpha，原图比 2048 小的不放大，胡子最大 1024）、法线、
// 发丝流向图（网页里沿发丝方向打高光）、烘焙的自遮挡
async function hairProxy(n, { cat = 'hair', label, src, normal, geom, clo, extra }) {
  if (cat !== 'hair') src = await brighten(src);
  const { width, height } = await sharp(src).metadata(), size = Math.min(cat === 'hair' ? 2048 : 1024, Math.max(width, height)), fsz = Math.min(1024, size);
  const maps = { map: tex(src, `${cat}-${n}`, size, { q: 86, alpha: true }) };
  if (normal) maps.normal = tex(normal, `${cat}-${n}-n`, fsz, { q: 88 });
  const { data: px, info } = await sharp(src).resize(fsz, fsz, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const flow = flowMap(px, info.width, info.height);
  maps.flow = `tex/${cat}flow-${n}.webp`;
  await sharp(flow, { raw: { width: info.width, height: info.height, channels: 3 } }).resize(fsz / 2, fsz / 2).webp({ lossless: true, effort: 5 }).toFile(`${OUT}/${maps.flow}`);
  const alphaAt = (u, v) => px[(Math.min(info.height - 1, Math.max(0, Math.floor((1 - v) * info.height))) * info.width + Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)))) * 4 + 3] / 255;
  const m = await proxy(cat, n, {
    label, geom, clo, maps, alpha: true, cull: false, extra: { mean: await meanColor(src), ...extra },
    bake: ({ c, r }) => ({ ao: hairAO({ pos: restProxy(c), index: r.idx, map: r.map, uv: r.uv, alphaAt, body: { pos: P0, index: bodyTris }, center: headCenter }) }),
  });
  log(cat, n, 'verts', m.nv, 'tris', m.tris, extra.credit ? `${extra.credit.author} ${extra.credit.license}` : '');
}
for (const [n, [label, sex]] of Object.entries(HAIR)) {
  const mm = mat('hair', n);
  await hairProxy(n, { label, src: `${mm.dir}/${mm.diffuseTexture}`, normal: mm.normalmapTexture && `${mm.dir}/${mm.normalmapTexture}`, geom: npmDir('hair', n), clo: `${DEB}/hair/${n}/${n}.mhclo`, extra: { sex } });
}
for (const [n, [src, label, sex]] of Object.entries(HAIR_PACK)) {
  const { dir, clo, geom, mm, credit } = packItem('hair', src);
  await hairProxy(n, { label, src: packFile(dir, mm.diffuseTexture), normal: mm.normalmapTexture && packFile(dir, mm.normalmapTexture), geom, clo, extra: { sex, credit } });
}
// 胡子：资源包里的 3D 胡须、小胡子（包里放在 clothes/ 下），和头发一样的发片、一样的材质，网页里和画在皮肤上的胡茬叠着用。
// id → [包里的目录, 名字, 胡须自带小胡子（随机时不再另加）]
const BEARD = {
  faun: ['culturalibre_faun_beard', '山羊胡'],
  scruffy: ['elvs_scruffy_beard1', '蓬乱长须', true],
  sigmund: ['grinsegold_beard_sigmund_wip', '短络腮胡', true],
  full: ['grinsegold_full_beard', '络腮胡'],
  viking: ['rehmanpolanski_beard_viking', '维京长须'],
  messy: ['wdg_scruffy_beard', '粗犷络腮胡'],
};
const MOUSTACHE = {
  dali: ['culturalibre_dal_moustache', '达利胡'],
  thin: ['grinsegold_moustache', '八字胡'],
  viking: ['rehmanpolanski_moustache_viking', '一字胡'],
};
for (const [cat, list] of [['beard', BEARD], ['moustache', MOUSTACHE]]) for (const [n, [src, label, stache]] of Object.entries(list)) {
  const { dir, clo, geom, mm, credit } = packItem('clothes', src);
  await hairProxy(n, { cat, label, src: packFile(dir, mm.diffuseTexture), normal: mm.normalmapTexture && packFile(dir, mm.normalmapTexture), geom, clo, extra: { credit, ...(stache ? { stache } : {}) } });
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
  // 资源包里的那顶红色棒球帽（MargaretToigo，CC0）帽子正面绣着一行竞选口号：擦掉，从上面一点搬干净的布过来，就是一顶普通的棒球帽
  baseball_cap: [{ box: [770, 1780, 1290, 1955], from: [0, -280] }],
};
// 配色：每套分几个部位（衣服按裁片在身上的高度分上衣 / 下装，西装、帽子整件一个部位；鞋分鞋面、鞋底、袜子），每个部位可以换颜色。
// 种类决定网页里的色板和权重图的宽严：牛仔布洗白的地方更亮、更灰，皮面有磨旧的浅色、高光和很深的褶子，都要放宽才能一起换色；
// 鞋面上颜色杂，主色按“覆盖面积”取，不用中位数。第三项是这一个部位自己的参数
// 布纹（网页里叠在衣服上的细节法线）：牛仔布默认斜纹，针织的（T 恤、卫衣、毛衣、紧身的运动服）写 KNIT，别的是平纹
const KNIT = { weave: 'knit' }, TWILL = { weave: 'twill' };
const PARTS = {
  male_casualsuit06: [['T 恤', 'top', KNIT], ['牛仔裤', 'denim']], male_casualsuit04: [['T 恤', 'top', KNIT], ['牛仔裤', 'denim']],
  male_casualsuit02: [['长袖 T 恤', 'top', KNIT], ['牛仔裤', 'denim']], male_casualsuit01: [['衬衫', 'top'], ['牛仔裤', 'denim']],
  male_casualsuit03: [['条纹衬衫', 'top'], ['牛仔裤', 'denim']], male_casualsuit05: [['夹克', 'top'], ['牛仔裤', 'denim']],
  male_elegantsuit01: [['西装', 'suit']],
  female_casualsuit01: [['T 恤', 'top', KNIT], ['牛仔裤', 'denim']], female_casualsuit02: [['T 恤', 'top', KNIT], ['热裤', 'denim']],
  female_elegantsuit01: [['衬衫', 'top'], ['半裙', 'bottom']], female_sportsuit01: [['运动背心', 'top', KNIT], ['紧身裤', 'bottom', KNIT]],
  fedora01: [['礼帽', 'hat']], fishing_hat: [['渔夫帽', 'bucket']], pith_helmet: [['探险帽', 'helmet']],
  shoes01: [['鞋面', 'leather'], ['鞋底', 'sole'], ['袜子', 'sock']], shoes03: [['鞋面', 'leather'], ['鞋底', 'sole'], ['袜子', 'sock']],
  shoes04: [['鞋面', 'leather'], ['鞋底', 'sole'], ['袜子', 'sock']], shoes06: [['鞋面', 'sneaker'], ['鞋底', 'sole'], ['袜子', 'sock']],
  // 旧运动鞋：鞋面是磨旧的皮，按皮面的宽严；鞋舌那块浅色帆布（贴图上的两个框，u0 v0 u1 v1）不换色
  shoes02: [['鞋面', 'sneaker', { tol: 0.12, qmax: 4.5, exclude: [[0.285, 0.24, 0.715, 0.455], [0.31, 0.45, 0.69, 0.495]] }], ['鞋底', 'sole'], ['袜子', 'sock']],
  // 白球鞋：鞋里子、鞋口的深色网布在贴图上占的地方比白色还大（穿着看不见），直接说从白色找主色
  shoes05: [['鞋面', 'sneaker', { pick: '#f0f0f0' }], ['鞋底', 'sole'], ['袜子', 'sock']],
};
const KIND = {
  top: { tol: 0.07, qmax: 3.3 }, denim: { tol: 0.15, qmax: 7, weave: 'twill' }, bottom: { tol: 0.08, qmax: 3.3 }, suit: { tol: 0.07, qmax: 3.3 },
  hat: { tol: 0.07, qmax: 3.3 }, bucket: { tol: 0.08, qmax: 3.3 }, helmet: { tol: 0.08, qmax: 3.3 }, coat: { tol: 0.08, qmax: 3.3 },
  leather: { tol: 0.12, qmax: 4.5, qmin: 0.12, pick: 'coverage' }, sneaker: { tol: 0.07, qmax: 3.3, pick: 'coverage' }, sole: { tol: 0.08, qmax: 3.3, pick: 'coverage' }, sock: { tol: 0.08, qmax: 3.3, pick: 'coverage' },
};
// texCloth 的 onData：算部位、主色和权重图（size²，R/G/B = 部位 0/1/2，无损 WebP，文件名跟着贴图：<file>-parts.webp），结果放进 out
// remap：岛的类别 → 部位（靴子：靴筒在“袜子”的高度，归鞋面）
// byColor(rgb)：按岛在贴图上的平均颜色分上下（背带裤的背带在肩上，按高度会分到 T 恤那边）
const partsJob = (n, clo, out, { size = 1024, file, shoe = false, remap = null, byColor = null }) => async (rgba, W, H, r) => {
  const def = PARTS[n], isl = islands(r), pos = restProxy(typeof clo === 'string' ? parseMhclo(clo) : clo);
  const cls = shoe ? classifyShoe(r, pos, isl) : classify(r, pos, isl);
  const opt = def.map(([, k, o]) => ({ ...KIND[k], ...o }));
  // 每个岛在贴图上的平均颜色（sRGB，按三角形中心取样）
  let mean = null;
  if (byColor || opt.some((o) => o.keep)) {
    const sum = Array.from({ length: isl.count }, () => [0, 0, 0, 0]);
    for (let t = 0; t < r.idx.length; t += 3) {
      const u = (r.uv[r.idx[t] * 2] + r.uv[r.idx[t + 1] * 2] + r.uv[r.idx[t + 2] * 2]) / 3, v = (r.uv[r.idx[t] * 2 + 1] + r.uv[r.idx[t + 1] * 2 + 1] + r.uv[r.idx[t + 2] * 2 + 1]) / 3;
      const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor((1 - v) * H))), o = (y * W + x) * 4, k = isl.triIsl[t / 3];
      for (let a = 0; a < 3; a++) sum[k][a] += rgba[o + a];
      sum[k][3]++;
    }
    mean = sum.map((s) => (s[3] ? s.slice(0, 3).map((x) => x / s[3]) : null));
  }
  if (byColor) for (let k = 0; k < isl.count; k++) if (mean[k]) cls[k] = byColor(mean[k]);
  // 部位的 keep(rgb)：这种颜色的岛不跟着换色（-2：有布，权重 0），比如毛领大衣的米白滚边
  const triPart = Int8Array.from(isl.triIsl, (k) => {
    const p = remap ? remap[cls[k]] : Math.min(cls[k], def.length - 1);
    return opt[p]?.keep && mean[k] && opt[p].keep(mean[k]) ? -2 : p;
  });
  size = Math.min(size, W);
  const { mask, dom } = partMask(rgba, W, H, r, triPart, def.length, {
    tol: opt.map((o) => o.tol), qmax: opt.map((o) => o.qmax), qmin: opt.map((o) => o.qmin), pick: opt.map((o) => o.pick), exclude: opt.flatMap((o, p) => (o.exclude ?? []).map((b) => [p, ...b])), out: size,
  });
  out.file = `tex/${file}-parts.webp`;
  await sharp(Buffer.from(mask), { raw: { width: size, height: size, channels: 3 } }).webp({ lossless: true, effort: 5 }).toFile(`${OUT}/${out.file}`);
  out.parts = def.map(([label, kind], p) => ({ label, kind, dom: dom[p], ...(opt[p].weave ? { weave: opt[p].weave } : {}) }));
  // 拆成上衣、下装时用：每个三角形按岛分的类别（0 上 1 下），权重图原始数据
  out.triCls = Int8Array.from(isl.triIsl, (k) => cls[k]);
  out.mask = mask; out.size = size;
};
// 男装再拆成单件的上衣、下装，男生也能像社区女装那样随便搭：按裁片分（和配色分上衣 / 下装是同一个分法），贴图共用整套的。
// 几套 T 恤牛仔裤里的牛仔裤是同一条（网格一样），只拆一次；西装拆成外套（连衬衫、领带）和西裤
const SPLIT = {
  male_casualsuit06: [['m_tee_white', '白 T 恤'], ['m_jeans', '牛仔裤']],
  male_casualsuit04: [['m_tee_blue', '蓝 T 恤']],
  male_casualsuit02: [['m_longsleeve', '长袖 T 恤']],
  male_casualsuit01: [['m_shirt', '衬衫'], ['m_jeans_grey', '灰牛仔裤']],
  male_casualsuit03: [['m_shirt_stripe', '条纹衬衫']],
  male_casualsuit05: [['m_jacket', '夹克']],
  male_elegantsuit01: [['m_suit_jacket', '西装外套'], ['m_suit_trousers', '西裤']],
  // 女装也拆：两套 T 恤的 T 恤是同一件，只拆一次；牛仔裤和运动紧身裤是同一个裤型，面料不一样，都拆
  female_casualsuit01: [['f_tee', 'T 恤'], ['f_jeans', '修身牛仔裤']],
  female_casualsuit02: [null, ['f_hotpants', '热裤']],
  // 半裙后面的衩缝上了（见 GEOM_FIX），不叫开衩半裙了；id 不改（存档、捏脸码里记的是 id）
  female_elegantsuit01: [['f_shirt_stripe', '修身条纹衬衫'], ['f_skirt', '直筒半裙']],
  female_sportsuit01: [['f_sport_top', '运动短上衣'], ['f_leggings', '运动紧身裤']],
};
// delete_verts 不够的：条纹衬衫半裙的只删到大腿中间，半裙底下靠近下摆的那截大腿还在，走路时迈出去的那条腿从裙子前片穿出来。
// 补上半裙（部位 1）底下的皮肤，见 coveredSkin
const MORE_DEL = { female_elegantsuit01: 1 };
for (const [n, [label, sex]] of Object.entries(OUTFIT)) {
  const mm = mat('clothes', n), cf = `${DEB}/clothes/${n}/${n}.mhclo`, pj = {};
  const maps = { map: await texCloth(`${mm.dir}/${mm.diffuseTexture}`, `cloth-${n}`, 2048, { q: 80, geom: npmDir('clothes', n), logos: LOGOS[n] ?? [], onData: partsJob(n, cf, pj, { file: `cloth-${n}` }) }) };
  if (mm.normalmapTexture) maps.normal = tex(`${mm.dir}/${mm.normalmapTexture}`, `cloth-${n}-n`, 1024, { q: 85 });
  if (mm.aomapTexture) maps.ao = tex(`${mm.dir}/${mm.aomapTexture}`, `cloth-${n}-ao`, 512, { q: 80 });
  maps.parts = pj.file;
  const clo = { ...parseMhclo(cf), uuid: fs.readFileSync(cf, 'utf8').match(/^uuid\s+(\S+)/m)?.[1] };
  if (n in MORE_DEL) {
    const more = coveredSkin(clo, npmDir('clothes', n), (t) => pj.triCls[t] === MORE_DEL[n]), had = new Set(clo.del);
    clo.del = [...new Set([...clo.del, ...more])].sort((a, b) => a - b);
    log('outfit', n, 'delete_verts', had.size, '->', clo.del.length);
  }
  await proxy('outfit', n, { label, geom: npmDir('clothes', n), clo, maps, extra: { sex, parts: pj.parts } });
  log('outfit', n, pj.parts.map((x) => `${x.label} ${x.dom.map((v) => Math.round(255 * v ** (1 / 2.2))).join(',')}`).join(' / '));
  if (SPLIT[n]) await splitOutfit(n, npmDir('clothes', n), clo, pj, maps, sex, SPLIT[n]);
}
// 衣服（keep 挑出来的三角形）底下的皮肤顶点，静止姿势里量：从皮肤顶点沿法线往外打一条射线，reach 以内打到衣服的；
// 或者往前、往后各打一条都打到衣服的（夹在裙子前片、后片中间——大腿内侧的法线朝着另一条腿，沿法线打不到裙子，
// 站着晃一晃就从前片中间穿出来）。打到的地方都要离衣服边（下摆、腰口）margin 以上——离边留出余量：迈腿时下摆往上缩，
// 靠近下摆的那一截皮肤还在，不会露出洞。大腿上的网格稀（一圈 4 ~ 5cm），按“往里缩几圈”留余量的话，裙子底下那截大腿整个缩没了，
// 所以按离边的距离算
function coveredSkin(c, geom, keep, { reach = 0.08, margin = 0.035 } = {}) {
  const X = restProxy(c), r = renderMesh(readGeom(geom)), T = [], ec = new Map();
  for (let t = 0; t < r.idx.length; t += 3) if (keep(t / 3)) {
    const v = [r.map[r.idx[t]], r.map[r.idx[t + 1]], r.map[r.idx[t + 2]]];
    T.push(...v);
    for (let k = 0; k < 3; k++) { const a = Math.min(v[k], v[(k + 1) % 3]), b = Math.max(v[k], v[(k + 1) % 3]), key = a * 1048576 + b; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  const border = [];
  for (const [key, n] of ec) if (n === 1) border.push(Math.floor(key / 1048576), key % 1048576);
  const lo = [0, 1, 2].map((a) => Math.min(...T.map((v) => X[v * 3 + a]))), hi = [0, 1, 2].map((a) => Math.max(...T.map((v) => X[v * 3 + a])));
  const N = new Float32Array(NV * 3), skin = new Uint8Array(NV);
  for (let t = 0; t < bodyTris.length; t += 3) {
    const v = [bodyTris[t], bodyTris[t + 1], bodyTris[t + 2]], p = v.map((i) => [P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]]);
    const u = [0, 1, 2].map((a) => p[1][a] - p[0][a]), w = [0, 1, 2].map((a) => p[2][a] - p[0][a]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const i of v) { skin[i] = 1; for (let a = 0; a < 3; a++) N[i * 3 + a] += n[a]; }
  }
  // 从 o 沿 d 打到衣服上最近的那一点（max 以内），打不到返回 null
  const cast = (o, d, max) => {
    let hit = Infinity;
    for (let t = 0; t < T.length; t += 3) {
      // Möller–Trumbore
      const a = T[t] * 3, b = T[t + 1] * 3, e = T[t + 2] * 3;
      const e1 = [X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]], e2 = [X[e] - X[a], X[e + 1] - X[a + 1], X[e + 2] - X[a + 2]];
      const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-12) continue;
      const tv = [o[0] - X[a], o[1] - X[a + 1], o[2] - X[a + 2]], uu = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
      if (uu < 0 || uu > 1) continue;
      const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
      if (vv < 0 || uu + vv > 1) continue;
      const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
      if (tt > 0 && tt < Math.min(max, hit)) hit = tt;
    }
    return hit === Infinity ? null : [0, 1, 2].map((k) => o[k] + d[k] * hit);
  };
  const farFromEdge = (h) => h && border.every((b) => Math.hypot(X[b * 3] - h[0], X[b * 3 + 1] - h[1], X[b * 3 + 2] - h[2]) >= margin);
  const out = [];
  for (let v = 0; v < NV; v++) {
    const o = [P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2]];
    if (!skin[v] || o.some((x, a) => x < lo[a] - reach || x > hi[a] + reach)) continue;
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]), d = [N[v * 3] / l, N[v * 3 + 1] / l, N[v * 3 + 2] / l];
    if (farFromEdge(cast(o, d, reach)) || (farFromEdge(cast(o, [0, 0, 1], 1)) && farFromEdge(cast(o, [0, 0, -1], 1)))) out.push(v);
  }
  return out;
}
// 把一套拆成上衣、下装两件（pieces[0] 上衣、pieces[1] 下装，可以只要一件；第三项是这一件额外的属性，比如 z）：
// 每个代理顶点属于哪一件按三角形的岛分；整套的 delete_verts 按“离哪一件的顶点近”分给两件（静止形状）
async function splitOutfit(n, geom, c, pj, maps, sex, pieces) {
  const pos = restProxy(c), r = renderMesh(readGeom(geom));
  const vc = new Int8Array(c.ref.length / 3).fill(-1);
  for (let t = 0; t < r.idx.length; t += 3) for (let j = 0; j < 3; j++) vc[r.map[r.idx[t + j]]] = pj.triCls[t / 3];
  const dels = [[], []];
  for (const v of c.del) {
    let best = Infinity, k = 0;
    for (let i = 0; i < vc.length; i++) {
      if (vc[i] < 0) continue;
      const d = (pos[i * 3] - P0[v * 3]) ** 2 + (pos[i * 3 + 1] - P0[v * 3 + 1]) ** 2 + (pos[i * 3 + 2] - P0[v * 3 + 2]) ** 2;
      if (d < best) { best = d; k = vc[i]; }
    }
    dels[k].push(v);
  }
  for (const [part, piece] of pieces.entries()) {
    if (!piece) continue;
    const [id, plabel, over = {}] = piece;
    // 配色：两个部位的整套，下装的权重在 G 通道，单拆出来的下装要一张自己的（放到 R）；西装整件一个部位，两件共用
    const two = pj.parts.length > 1;
    let partsFile = pj.file;
    if (two && part === 1) {
      const m1 = Buffer.alloc(pj.size * pj.size * 3);
      for (let i = 0; i < pj.size * pj.size; i++) m1[i * 3] = pj.mask[i * 3 + 1];
      partsFile = pj.file.replace(/-parts\.webp$/, '-p1-parts.webp');
      await sharp(m1, { raw: { width: pj.size, height: pj.size, channels: 3 } }).webp({ lossless: true, effort: 5 }).toFile(`${OUT}/${partsFile}`);
    }
    const pm = await proxy(part === 0 ? 'top' : 'bottom', id, {
      label: plabel, geom, clo: c, maps: { ...maps, parts: partsFile }, keep: (t) => pj.triCls[t] === part, del: dels[part],
      extra: { sex, parts: [pj.parts[two ? part : 0]], ...over },
    });
    log(part === 0 ? 'top' : 'bottom', id, 'from', n, 'verts', pm.nv, 'tris', pm.tris, 'del', dels[part].length);
  }
}
// 鞋也分男女（m 男款，f 女款，u 都行），网页里按它排序、随机
const SHOES = { shoes05: ['白色运动鞋', 'u'], shoes06: ['蓝色运动鞋', 'u'], shoes02: ['旧运动鞋', 'u'], shoes01: ['棕色皮鞋', 'm'], shoes04: ['黑色休闲皮鞋', 'm'], shoes03: ['黑色皮鞋', 'u'] };
for (const [n, [label, sex]] of Object.entries(SHOES)) {
  const mm = mat('clothes', n), clo = `${DEB}/clothes/${n}/${n}.mhclo`, pj = {};
  const maps = { map: await texCloth(`${mm.dir}/${mm.diffuseTexture}`, `shoe-${n}`, 1024, { q: 84, geom: npmDir('clothes', n), onData: partsJob(n, clo, pj, { size: 512, file: `shoe-${n}`, shoe: true }) }) };
  if (mm.normalmapTexture) maps.normal = tex(`${mm.dir}/${mm.normalmapTexture}`, `shoe-${n}-n`, 1024, { q: 85 });
  maps.parts = pj.file;
  await proxy('shoes', n, { label, geom: npmDir('clothes', n), clo, maps, extra: { sex, parts: pj.parts } });
  log('shoes', n, pj.parts.map((x) => `${x.label} ${x.dom.map((v) => Math.round(255 * v ** (1 / 2.2))).join(',')}`).join(' / '));
}
// 帽子：礼帽（Ubuntu 包里的 .mhclo）；歪戴的礼帽是同一顶帽子换一套贴合数据，UV 一样，贴图和权重图共用；
// 渔夫帽、探险帽是 npm 包里的社区资源（CC BY，作者和许可记进 credit，网页和导出的素材来源里都写上）
{
  const cf = `${DEB}/clothes/fedora01/fedora.mhclo`, clo = parseMhclo(cf), pj = {};
  const mm = parseMhmat(`${DEB}/clothes/fedora01/${clo.material}`);
  const maps = { map: await texCloth(`${mm.dir}/${mm.diffuseTexture}`, 'hat-fedora01', 1024, { q: 84, geom: npmDir('clothes', 'fedora'), onData: partsJob('fedora01', cf, pj, { size: 512, file: 'hat-fedora01' }) }) };
  if (mm.normalmapTexture) maps.normal = tex(`${mm.dir}/${mm.normalmapTexture}`, 'hat-fedora01-n', 512, { q: 85 });
  maps.parts = pj.file;
  await proxy('hat', 'fedora01', { label: '礼帽', geom: npmDir('clothes', 'fedora'), clo: cf, maps, extra: { parts: pj.parts } });
  const uvOf = (n) => { const r = renderMesh(readGeom(npmDir('clothes', n))); return JSON.stringify([r.uv, r.idx]); };
  if (uvOf('fedora') !== uvOf('fedora_cocked')) throw new Error('歪戴礼帽和礼帽的 UV 不一样，不能共用贴图');
  await proxy('hat', 'fedora01_cocked', { label: '歪戴礼帽', geom: npmDir('clothes', 'fedora_cocked'), clo: `${DEB}/clothes/fedora01/fedora_cocked.mhclo`, maps, extra: { parts: pj.parts } });
  const COMMUNITY = {
    fishing_hat: { src: 'Fishing_Hat_01', label: '渔夫帽', map: 'Fishing_Hat_01.png', normal: 'Fishing_Hat_01_NRM.png' },
    pith_helmet: { src: 'pith_helmet', label: '探险帽', map: 'pith_helmet_diff.jpg', normal: 'pith_helmet_nrml.jpg' },
  };
  for (const [n, h] of Object.entries(COMMUNITY)) {
    const geom = npmDir('clothes', h.src), dir = path.dirname(geom), hc = npmClo('clothes', h.src, clo.scale), hp = {};
    const lic = JSON.parse(fs.readFileSync(geom, 'utf8')).metadata.license;
    const hm = { map: await texCloth(`${dir}/textures/${h.map}`, `hat-${n}`, 512, { q: 86, geom, onData: partsJob(n, hc, hp, { size: 512, file: `hat-${n}` }) }) };
    hm.normal = tex(`${dir}/textures/${h.normal}`, `hat-${n}-n`, 512, { q: 85 });
    hm.parts = hp.file;
    await proxy('hat', n, { label: h.label, geom, clo: hc, maps: hm, extra: { parts: hp.parts, credit: { author: lic.author, license: lic.license.replace(/^CCBY$/, 'CC BY') } } });
    log('hat', n, hp.parts.map((x) => `${x.label} ${x.dom.map((v) => Math.round(255 * v ** (1 / 2.2))).join(',')}`).join(' / '), lic.author, lic.license);
  }
}
// MakeHuman 社区作者的衣服（npm 包里收的 JSON，CC BY / CC0）：整套（连衣裙、大衣）、上衣、下装可以自由搭配，还有一双雪地靴。
// 贴合数据和帽子一样从 JSON 里读，缩放参考借女装的（这些都是照着女性身体做的）；贴图都是 512²。
// 只挑了日常的款式（内衣、泳装没收），带蕾丝透明的那条白裙（F_Dress_03）要半透明混合，也先不收
{
  const fscale = parseMhclo(`${DEB}/clothes/female_casualsuit01/female_casualsuit01.mhclo`).scale;
  const C = {
    dress_wine: ['F_Dress_01', 'outfit', '酒红连衣裙', [['连衣裙', 'top']]],
    dress_mint: ['F_Dress_02', 'outfit', '薄荷绿背心裙', [['连衣裙', 'top']]],
    dress_black: ['F_Dress_04', 'outfit', '黑色小礼服', [['连衣裙', 'suit']]],
    tube_dress: ['TubeDress', 'outfit', '白色抹胸裙', [['抹胸裙', 'top']]],
    // 毛领大衣：银灰的大衣（偏冷），领子、门襟、袖口、下摆、口袋的毛边是米白的（偏暖），毛边不跟着换色
    coat: ['Coat', 'outfit', '毛领大衣', [['大衣', 'coat', { keep: (c) => c[0] > c[2] + 6 }]]],
    tunic: ['Asymmetric_Tunic_and_Sash', 'top', '碎花长衫', [['长衫', 'top']]],
    tank_top: ['Tank_Top_01', 'top', '运动背心', [['背心', 'top', KNIT]], { sex: 'u' }],
    sleeveless: ['Sleeveless', 'top', '无袖系带衬衫', [['衬衫', 'top']]],
    tube_top: ['TubeTop', 'top', '抹胸', [['抹胸', 'top', KNIT]]],
    vneck_top: ['VNeckTop', 'top', 'V 领背心', [['背心', 'top', KNIT]]],
    cami: ['spaghetti-top', 'top', '吊带衫', [['吊带衫', 'top']]],
    camo_tee: ['short_tail_camo_tee', 'top', '迷彩短 T', [['T 恤', 'top', KNIT]]],
    tight_jeans: ['Tightjeans', 'bottom', '紧身牛仔裤', [['牛仔裤', 'denim']]],
    jean_shorts: ['ShortJeans', 'bottom', '牛仔短裤', [['短裤', 'denim']]],
    jean_skirt: ['JeansSkirt', 'bottom', '牛仔短裙', [['短裙', 'denim']]],
    miniskirt: ['miniskirt', 'bottom', '黑色短裙', [['短裙', 'bottom']]],
    // 雪地靴原来的 z_depth 和裤子一样（50），叠穿时分不出里外；放到裤子外面（裤腿塞进靴筒）
    winter_boots: ['WinterBoots', 'shoes', '雪地靴', [['靴面', 'leather'], ['鞋底', 'sole']], { z: 55, sex: 'u' }],
  };
  for (const [id, [src, slot, label, parts, over]] of Object.entries(C)) {
    PARTS[id] = parts;
    const geom = npmDir('clothes', src), dir = path.dirname(geom), j = JSON.parse(fs.readFileSync(geom, 'utf8'));
    const m0 = j.materials[0], lic = j.metadata.license, clo = npmClo('clothes', src, fscale), pj = {};
    const shoe = slot === 'shoes', file = `${shoe ? 'shoe' : 'cloth'}-${id}`;
    const maps = { map: await texCloth(`${dir}/${m0.mapDiffuse}`, file, 512, { q: 86, geom, onData: partsJob(id, clo, pj, { size: 512, file, shoe, remap: shoe ? [0, 1, 0] : null }) }) };
    if (m0.mapNormal) maps.normal = tex(`${dir}/${m0.mapNormal}`, `${file}-n`, 512, { q: 85 });
    maps.parts = pj.file;
    const credit = { author: lic.author, license: lic.license.replace(/^CCBY$/, 'CC BY').replace(/\s*\(see also.*$/, '') };
    await proxy(slot, id, { label, geom, clo, maps, extra: { sex: 'f', parts: pj.parts, credit, ...over } });
    log(slot, id, pj.parts.map((x) => `${x.label} ${x.dom.map((v) => Math.round(255 * v ** (1 / 2.2))).join(',')}`).join(' / '), credit.author, credit.license);
  }
}
// 白 T 恤工装背带裤：MakeHuman 自带（CC0）。Ubuntu 包里 1.1.1 的 .mhclo 和 npm 里的网格不是同一版，贴合数据、贴图（512²）都用 npm JSON 里的，
// 缩放参考借男款 T 恤牛仔裤的。整套收一份，再单拆出背带裤（T 恤和白 T 恤那件差不多，不另拆）；背带裤穿在上衣外面，z 放到 52（单件上衣是 50 再加 0.5）
{
  const n = 'male_worksuit01', geom = npmDir('clothes', n), dir = path.dirname(geom), m0 = JSON.parse(fs.readFileSync(geom, 'utf8')).materials[0];
  const clo = npmClo('clothes', n, parseMhclo(`${DEB}/clothes/male_casualsuit06/male_casualsuit06.mhclo`).scale), pj = {};
  PARTS[n] = [['T 恤', 'top', KNIT], ['背带裤', 'denim']];
  // 白的是 T 恤，其余（蓝布、背带、黑扣子、金属夹子）都是背带裤
  const byColor = (c) => (Math.min(...c) > 200 ? 0 : 1);
  const maps = { map: await texCloth(`${dir}/${m0.mapDiffuse}`, `cloth-${n}`, 512, { q: 86, geom, onData: partsJob(n, clo, pj, { size: 512, file: `cloth-${n}`, byColor }) }) };
  maps.normal = tex(`${dir}/${m0.mapNormal}`, `cloth-${n}-n`, 512, { q: 85 });
  maps.ao = tex(`${dir}/${m0.mapAO}`, `cloth-${n}-ao`, 512, { q: 80 });
  maps.parts = pj.file;
  await proxy('outfit', n, { label: '白 T 恤工装背带裤', geom, clo, maps, extra: { sex: 'm', parts: pj.parts } });
  log('outfit', n, pj.parts.map((x) => `${x.label} ${x.dom.map((v) => Math.round(255 * v ** (1 / 2.2))).join(',')}`).join(' / '));
  await splitOutfit(n, geom, clo, pj, maps, 'm', [null, ['m_overalls', '工装背带裤', { z: 52 }]]);
}
// 资源包里的衣服、鞋、帽子（packItem 见头发那里）：贴图缩到 1024²，法线 512²。
// 塞进裤腰的那件衬衫领带（elvs_male_shirt_tie_tucked1）下摆很高，配别的裤子腰上都露一截皮肤，没收
{
  // z：叠穿的里外（越大越外）。系统自带的鞋是 5（裤腿盖在鞋外面），雪地靴 55（裤腿塞进靴筒）；
  // 不塞进裤子的衬衫放到牛仔裤（50）外面、背带裤（52）里面
  const C = {
    hoodie: ['elvs_hooded_sweat_jacket1', 'top', '连帽卫衣', [['卫衣', 'top', KNIT]], { sex: 'u' }],
    sweater_grey: ['mindfront_knitted_sweater_01', 'top', '粗针毛衣', [['毛衣', 'top', KNIT]], { sex: 'u' }],
    fisherman: ['toigo_fisherman_sweater', 'top', '罗纹毛衣', [['毛衣', 'top', KNIT]], { sex: 'u' }],
    lusekofta: ['mindfront_lusekofta', 'top', '挪威毛衣开衫', [['开衫', 'top', KNIT]], { sex: 'u' }],
    polo: ['namuhekam_male_polo_shirt', 'top', 'Polo 衫', [['Polo 衫', 'top', KNIT]], { sex: 'm' }],
    shirt_casual: ['elvs_male_shirt_untucked_bd1', 'top', '休闲衬衫', [['衬衫', 'top']], { sex: 'm', z: 51 }],
    cargo: ['cortu_cargo_pants', 'bottom', '工装裤', [['工装裤', 'bottom', TWILL]], { sex: 'm' }],
    shorts: ['elvs_male_trouser_short_1', 'bottom', '休闲短裤', [['短裤', 'bottom']], { sex: 'm' }],
    board_shorts: ['mindfront_male_swimming_trunks_01', 'bottom', '沙滩短裤', [['短裤', 'bottom']], { sex: 'm' }],
    worn_jeans: ['mindfront_male_trousers_1', 'bottom', '做旧牛仔裤', [['牛仔裤', 'denim']], { sex: 'm' }],
    wool_pants: ['toigo_wool_pants', 'bottom', '羊毛西裤', [['西裤', 'bottom']], { sex: 'm' }],
    // 白色礼服：白外套、深灰西裤分两个部位（主色按白色取，黑色的驳领、领结不跟着换）
    dinner_jacket: ['toigo_suit_with_dinner_jacket', 'outfit', '白色礼服', [['外套', 'suit', { pick: '#f0efee' }], ['西裤', 'suit']], { sex: 'm' }],
    suit_navy: ['toigo_male_suit_3', 'outfit', '藏青西装', [['西装', 'suit']], { sex: 'm' }],
    suit_db: ['toigo_male_double-breasted_suit', 'outfit', '双排扣西装', [['西装', 'suit']], { sex: 'm' }],
    // 高帮球鞋：贴图上黑色的鞋里子比红色鞋面占的地方大，主色直接说从红色找
    hightops: ['culturalibre_sneakers', 'shoes', '高帮球鞋', [['鞋面', 'sneaker', { pick: '#9e3e31' }], ['鞋底', 'sole']], { z: 5, sex: 'u' }],
    runners: ['punkduck_running_shoes_01', 'shoes', '跑鞋', [['鞋面', 'sneaker'], ['鞋底', 'sole']], { z: 5, sex: 'u' }],
    slipons: ['punkduck_comfortable_sneakers', 'shoes', '一脚蹬', [['鞋面', 'sneaker'], ['鞋底', 'sole']], { z: 5, sex: 'u' }],
    oxford: ['mindfront_shoes_oxford_male', 'shoes', '牛津鞋', [['鞋面', 'leather'], ['鞋底', 'sole'], ['袜子', 'sock']], { z: 5, sex: 'u' }],
    chelsea: ['toigo_ankle_boots_male', 'shoes', '切尔西靴', [['靴面', 'leather'], ['鞋底', 'sole']], { z: 5, sex: 'u' }],
    biker_boots: ['mindfront_shoes_biker_boots_male', 'shoes', '机车靴', [['靴面', 'leather'], ['鞋底', 'sole']], { sex: 'u' }],
    // 鞋（二）：男女都能穿的。孟克鞋男女各有一版，男版女生穿也合脚，只收一双；人字拖其实是交叉带的凉拖，露着脚趾（不藏脚）
    monk: ['mindfront_shoes_monk_strap_male', 'shoes', '孟克鞋', [['鞋面', 'leather'], ['鞋底', 'sole'], ['袜子', 'sock']], { z: 5, sex: 'u' }],
    flip_flops: ['elvs_male_flip_flop_sandals1', 'shoes', '凉拖', [['拖鞋', 'sneaker']], { z: 5, sex: 'u' }],
    kill_bill: ['punkduck_kill_bill_shoes', 'shoes', '复古训练鞋', [['鞋面', 'sneaker'], ['鞋底', 'sole']], { z: 5, sex: 'u' }],
    tennis: ['punkduck_tennis_shoes', 'shoes', '网球鞋', [['鞋面', 'sneaker'], ['鞋底', 'sole'], ['袜子', 'sock']], { z: 5, sex: 'u' }],
    cycling: ['punkduck_cycling_shoes', 'shoes', '骑行鞋', [['鞋面', 'sneaker'], ['鞋底', 'sole']], { z: 5, sex: 'u' }],
    medieval: ['punkduck_medieval_boots', 'shoes', '翻边短靴', [['靴面', 'leather'], ['鞋底', 'sole']], { sex: 'u' }],
    newsboy: ['jujube_newsboy_cap', 'hat', '报童帽', [['帽子', 'hat']]],
    beanie: ['mindfront_knitted_hat_01', 'hat', '毛线帽', [['毛线帽', 'hat', KNIT]]],
    // 女款：连衣裙、旗袍、西装套装、网球裙（整套），上衣、半身裙、裤子，平底鞋、马靴，帽子。高跟鞋要配 MakeHuman 专门的脚部形变才穿得上，没收；
    // 罗马凉鞋、镂空的玛丽珍靠贴图透明做出镂空，这里衣服不做透明，也没收；男款的牛津鞋、机车靴女生穿也合脚，不再收女式的那一双
    qipao: ['punkduck_middle_length_qipao', 'outfit', '旗袍', [['旗袍', 'top']], { sex: 'f' }],
    camisole_dress: ['toigo_camisole_dress_with_full_skirt', 'outfit', '碎花吊带裙', [['连衣裙', 'top']], { sex: 'f' }],
    tiered_dress: ['toigo_dress_with_tiered_skirt', 'outfit', '挂脖蛋糕裙', [['连衣裙', 'top']], { sex: 'f' }],
    red_halter: ['elvs_halter_dress_knee_length', 'outfit', '红色挂脖裙', [['连衣裙', 'top']], { sex: 'f' }],
    evening_gown: ['punkduck_evening_gown', 'outfit', '晚礼服长裙', [['长裙', 'top']], { sex: 'f' }],
    teal_dress: ['mindfront_f_dress_06', 'outfit', '湖蓝连衣裙', [['连衣裙', 'top']], { sex: 'f' }],
    coral_dress: ['mindfront_f_dress_08', 'outfit', '珊瑚红连衣裙', [['连衣裙', 'top']], { sex: 'f' }],
    tweed_dress: ['mindfront_f_dress_11', 'outfit', '格纹连衣裙', [['连衣裙', 'top']], { sex: 'f' }],
    f_suit_skirt: ['toigo_female_suit', 'outfit', '黑色西装套裙', [['套裙', 'suit']], { sex: 'f' }],
    f_suit_pink: ['toigo_female_suit_2', 'outfit', '粉色西装套装', [['西装', 'suit']], { sex: 'f' }],
    f_suit_db: ['toigo_female_double-breasted_suit', 'outfit', '灰色双排扣套装', [['西装', 'suit']], { sex: 'f' }],
    tennis_dress: ['punkduck_tennis_dress', 'outfit', '网球裙', [['网球裙', 'top']], { sex: 'f' }],
    off_shoulder: ['punkduck_off-shoulder_long-sleeve_top', 'top', '露肩上衣', [['上衣', 'top', KNIT]], { sex: 'f' }],
    lace_blouse: ['punkduck_lace_up_blouse', 'top', '系带衬衫', [['衬衫', 'top']], { sex: 'f' }],
    retro_top: ['punkduck_retro_top', 'top', '红色复古上衣', [['上衣', 'top', KNIT]], { sex: 'f' }],
    crop_top: ['punkduck_high_neck_crop_top', 'top', '蕾丝高领背心', [['背心', 'top']], { sex: 'f' }],
    breton: ['ews_striped_shirt', 'top', '条纹短上衣', [['上衣', 'top', KNIT]], { sex: 'f' }],
    long_skirt: ['toigo_long_full_skirt', 'bottom', '碎花长裙', [['长裙', 'bottom']], { sex: 'f' }],
    pleated_plaid: ['elvs_pleated_plaid_mini_skirt', 'bottom', '蓝格子百褶裙', [['百褶裙', 'bottom']], { sex: 'f' }],
    pleated_red: ['mtknife_pleated_mini_skirt', 'bottom', '红格子百褶裙', [['百褶裙', 'bottom']], { sex: 'f' }],
    pencil_skirt: ['elvs_pencil_skirt', 'bottom', '铅笔裙', [['半裙', 'bottom']], { sex: 'f' }],
    polka_skirt: ['punkduck_retro_polka_dot_skirt', 'bottom', '波点裙', [['半裙', 'bottom']], { sex: 'f' }],
    bootcut: ['elvs_jeans_bootcut', 'bottom', '喇叭牛仔裤', [['牛仔裤', 'denim']], { sex: 'f' }],
    f_jeans_patch: ['mindfront_female_trousers_1', 'bottom', '刺绣牛仔裤', [['牛仔裤', 'denim']], { sex: 'f' }],
    skinny_pants: ['elvs_disco_pants_skinny', 'bottom', '黑色紧身裤', [['长裤', 'bottom']], { sex: 'f' }],
    // 芭蕾鞋整只都很矮，按高度分会全算成鞋底：整只一个部位，主色从深灰的鞋面找（不然浅色鞋垫的面积大，会被当成主色）
    ballet_flats: ['toigo_ballet_flats', 'shoes', '芭蕾平底鞋', [['鞋面', 'leather', { pick: '#303030' }]], { z: 5, sex: 'f' }],
    mary_janes: ['toigo_mj_cloth_shoes', 'shoes', '玛丽珍鞋', [['鞋面', 'leather'], ['鞋底', 'sole']], { z: 5, sex: 'f' }],
    ankle_boots_f: ['toigo_ankle_boots_female', 'shoes', '白色短靴', [['靴面', 'leather'], ['鞋底', 'sole']], { z: 5, sex: 'f' }],
    riding_boots: ['punkduck_riding_boots', 'shoes', '马靴', [['靴面', 'leather'], ['鞋底', 'sole']], { z: 55, sex: 'f' }],
    // 鞋（二）：女款。几款平底鞋整只都很矮，整只一个部位。过膝长靴盖在裤子外面（牛仔裤塞进靴筒），中筒靴照作者的设置在裤腿里面。
    // 没收的：马鞍鞋（贴图是草草改的，鞋舌上一块方形的污渍）；豹纹平底鞋（一双鞋五万多个三角形，比整个人还多）；
    // 和收了的太像的（花朵芭蕾鞋、另一款蝴蝶结平底鞋）；卡通风格的、戏服（英雄靴、精灵鞋、盔甲靴、海盗靴）、半透明的雨靴，
    // 十五万个三角形的高帮帆布鞋；转自 Blendswap、原许可没写清的；高跟的（要配专门的脚部形变）
    t_bar: ['cortu_t-bar', 'shoes', 'T 字带鞋', [['鞋面', 'leather'], ['鞋底', 'sole']], { z: 5, sex: 'f' }],
    flats_bow: ['toigo_ballet_flats_with_bows', 'shoes', '蝴蝶结芭蕾鞋', [['鞋面', 'leather']], { z: 5, sex: 'f' }],
    two_tone: ['elvs_flatshoe_pointy1', 'shoes', '拼色平底鞋', [['鞋面', 'leather']], { z: 5, sex: 'f' }],
    woven: ['elvs_flatshoe_plain1', 'shoes', '编织平底鞋', [['鞋面', 'leather']], { z: 5, sex: 'f' }],
    overknee: ['cortu_floppy_overknee_shoes', 'shoes', '过膝长靴', [['靴面', 'leather']], { z: 55, sex: 'f' }],
    calf_boots: ['madmanny_tight_leather_boots', 'shoes', '中筒靴', [['靴面', 'leather'], ['鞋底', 'sole']], { sex: 'f' }],
    cloche: ['aethelraed_unraed_cloche_hat', 'hat', '钟形帽', [['帽子', 'hat']]],
    bowler: ['culturalibre_cl_bowler_hat', 'hat', '圆顶礼帽', [['帽子', 'hat']]],
    visor: ['punkduck_sun_visor_sports_visor', 'hat', '遮阳帽', [['帽子', 'hat']]],
    // 帽子（二）：棒球帽擦掉了正面的字（见上面 LOGOS）。女巫帽作者说是给女性模型做的，男性的头大一圈，帽檐盖住眼睛，标成女款。
    // 没收的：和已有的太像的（特里尔比帽像礼帽，另一顶圣诞帽，巫师帽像女巫帽）；戏服、面具一类（骷髅、牛角、斯巴达、十字军头盔，
    // 荆棘冠、羽毛头饰、套头的袋子、面纱、女仆头饰、堂吉诃德帽）；盖住整张脸的摩托车头盔、计时赛自行车头盔；三顶军用钢盔
    baseball_cap: ['toigo_maga_hat', 'hat', '棒球帽', [['帽子', 'hat']]],
    flat_cap: ['elvs_male_flat_cap1', 'hat', '平顶帽', [['帽子', 'hat']]],
    santa_hat: ['elvs_santa_hat', 'hat', '圣诞帽', [['帽子', 'hat']]],
    slouchy_beanie: ['elvs_slouchy_beanie1', 'hat', '宽松毛线帽', [['毛线帽', 'hat', KNIT]]],
    top_hat: ['elvs_tophat1', 'hat', '高礼帽', [['帽子', 'hat']]],
    chef_hat: ['elvs_unisex_chef_hat_1', 'hat', '厨师帽', [['帽子', 'hat']]],
    patrol_cap: ['mindfront_patrol_cap', 'hat', '迷彩帽', [['帽子', 'hat']]],
    sherpa_hat: ['mindfront_sherpa_hat', 'hat', '护耳帽', [['帽子', 'hat']]],
    riding_helmet: ['punkduck_riding_helmet', 'hat', '马术头盔', [['头盔', 'helmet']]],
    swim_cap: ['punkduck_swim_cap', 'hat', '泳帽', [['泳帽', 'hat']]],
    leather_helmet: ['maciekg_leather_helmet', 'hat', '皮飞行帽', [['帽子', 'hat']]],
    witch_hat: ['elvs_witchy_hallows_hat1', 'hat', '女巫帽', [['帽子', 'hat']], { sex: 'f' }],
  };
  for (const [id, [src, slot, label, parts, over]] of Object.entries(C)) {
    PARTS[id] = parts;
    const { dir, clo, geom, mm, credit } = packItem('clothes', src);
    const shoe = slot === 'shoes', file = `${shoe ? 'shoe' : slot === 'hat' ? 'hat' : 'cloth'}-${id}`, pj = {};
    const maps = { map: await texCloth(packFile(dir, mm.diffuseTexture), file, 1024, { q: 84, geom, logos: LOGOS[id] ?? [], onData: partsJob(id, clo, pj, { size: 512, file, shoe, remap: shoe && parts.length === 2 ? [0, 1, 0] : null }) }) };
    if (mm.normalmapTexture) maps.normal = tex(packFile(dir, mm.normalmapTexture), `${file}-n`, 512, { q: 85 });
    // 只给了 bumpTexture 的（中筒靴的皮纹、黑色西装套裙；泳裤、罗纹毛衣写在 bumpTexture 里的其实是法线贴图）：
    // 以前没用上，中筒靴光溜溜的像胶靴。鞋的皮纹细，法线留 1024²
    else if (mm.bumpTexture) maps.normal = await bumpTex(packFile(dir, mm.bumpTexture), `${file}-n`, shoe ? 1024 : 512);
    // 中筒靴还用上它的高光贴图：磨旧的地方亮、褶子里哑，皮面的光泽不再是一整片一样的
    if (id === 'calf_boots') maps.rough = await specRough(packFile(dir, mm.specularTexture), `${file}-r`, 512);
    maps.parts = pj.file;
    const pm = await proxy(slot, id, { label, geom, clo, maps, extra: { parts: pj.parts, credit, ...over } });
    log(slot, id, 'verts', pm.nv, 'tris', pm.tris, 'z', pm.z, pj.parts.map((x) => `${x.label} ${x.dom.map((v) => Math.round(255 * v ** (1 / 2.2))).join(',')}`).join(' / '), credit.author, credit.license);
  }
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
