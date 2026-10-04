// 动作：Quaternius 的 Universal Animation Library（CC0）→ 我们的骨架用的数据。
// 每个动作按 30 帧/秒采样，存“世界空间里相对静止姿势的旋转”（每根骨头一个四元数），外加胯部的位移（以胯高为单位）。
// 网页里换到任意体型的骨架上：先把我们骨头的静止方向转到源骨架的静止方向，再乘上这个相对旋转。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

// 默认读 scripts/human/fetch.sh 下载的那份（.cache/human-src/ual/glTF），也可以用 UAL 指到别处
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const UAL = process.env.UAL ?? path.join(ROOT, '.cache/human-src/ual/glTF');
const OUT = process.env.OUT ?? path.join(ROOT, 'viewer/human');
if (!fs.existsSync(UAL)) { console.error(`找不到 ${UAL}：先运行 bash scripts/human/fetch.sh，或者用 UAL 指到动作库的 glTF 目录`); process.exit(1); }
const gltfFile = fs.readdirSync(UAL).find((f) => f.endsWith('.gltf'));
const g = JSON.parse(fs.readFileSync(`${UAL}/${gltfFile}`, 'utf8'));
const bin = fs.readFileSync(`${UAL}/${g.buffers[0].uri}`);
const acc = (i) => {
  const a = g.accessors[i], bv = g.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (a.componentType !== 5126) throw new Error('只支持 float');
  return new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4));
};
const nodes = g.nodes.map((n, i) => ({ i, name: n.name, t: n.translation ?? [0, 0, 0], r: n.rotation ?? [0, 0, 0, 1], s: n.scale ?? [1, 1, 1], kids: n.children ?? [], parent: -1 }));
nodes.forEach((n) => n.kids.forEach((k) => { nodes[k].parent = n.i; }));
const byName = Object.fromEntries(nodes.map((n) => [n.name, n.i]));

// 源骨头 → 我们的骨头
const MAP = { 'DEF-hips': 'pelvis', 'DEF-spine.001': 'spine_01', 'DEF-spine.002': 'spine_02', 'DEF-spine.003': 'spine_03', 'DEF-neck': 'neck_01', 'DEF-head': 'head' };
for (const [S, s] of [['L', 'l'], ['R', 'r']]) {
  Object.assign(MAP, { [`DEF-shoulder.${S}`]: `clavicle_${s}`, [`DEF-upper_arm.${S}`]: `upperarm_${s}`, [`DEF-forearm.${S}`]: `lowerarm_${s}`, [`DEF-hand.${S}`]: `hand_${s}`,
    [`DEF-thigh.${S}`]: `thigh_${s}`, [`DEF-shin.${S}`]: `calf_${s}`, [`DEF-foot.${S}`]: `foot_${s}`, [`DEF-toe.${S}`]: `ball_${s}` });
  for (const [src, dst] of [['f_index', 'index'], ['f_middle', 'middle'], ['f_ring', 'ring'], ['f_pinky', 'pinky'], ['thumb', 'thumb']]) for (let k = 1; k <= 3; k++) MAP[`DEF-${src}.0${k}.${S}`] = `${dst}_0${k}_${s}`;
}
const human = JSON.parse(fs.readFileSync(`${OUT}/human.json`, 'utf8'));
// 只存有对应源骨头的那些（眼球不跟动作走）
const BONES = human.rig.bones.map((b) => b.name).filter((b) => Object.values(MAP).includes(b));
const srcOf = BONES.map((b) => Object.keys(MAP).find((k) => MAP[k] === b));
const missing = BONES.filter((b, i) => byName[srcOf[i]] === undefined);
if (missing.length) throw new Error('没对上：' + missing.join(','));

// 某一时刻所有节点的世界矩阵（local = 动画值或静止值）
function worldAt(local) {
  const W = new Array(nodes.length);
  const visit = (i, parentM) => {
    const n = nodes[i], L = local[i];
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...L.t), new THREE.Quaternion(...L.r), new THREE.Vector3(...L.s));
    W[i] = parentM ? parentM.clone().multiply(m) : m;
    n.kids.forEach((k) => visit(k, W[i]));
  };
  nodes.filter((n) => n.parent < 0).forEach((n) => visit(n.i, null));
  return W;
}
const restLocal = nodes.map((n) => ({ t: n.t, r: n.r, s: n.s }));
const restW = worldAt(restLocal);
const rot = (m) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return q; };
const pos = (m) => new THREE.Vector3().setFromMatrixPosition(m);
const restQ = BONES.map((b, i) => rot(restW[byName[srcOf[i]]]));
// 静止方向：骨头的 +Y（Blender 的骨头都沿 +Y）
const restDir = restQ.map((q) => new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize());
const hipsI = byName['DEF-hips'];
const hipsRest = pos(restW[hipsI]);
// 朝向：脚尖在脚踝的哪一边
const ankle = pos(restW[byName['DEF-foot.L']]), toe = pos(restW[byName['DEF-toe.L']]);
const facing = Math.sign(toe.z - ankle.z);
console.log('hips rest', hipsRest.toArray().map((x) => x.toFixed(3)), 'facing', facing > 0 ? '+Z' : '-Z');

const CLIPS = [
  ['Idle_Loop', '待机', true], ['Idle_Talking_Loop', '说话', true], ['Walk_Loop', '走路', true], ['Walk_Formal_Loop', '正式步态', true],
  ['Jog_Fwd_Loop', '慢跑', true], ['Sprint_Loop', '冲刺', true], ['Dance_Loop', '跳舞', true], ['Crouch_Idle_Loop', '蹲下', true],
  ['Crouch_Fwd_Loop', '蹲着走', true], ['Punch_Jab', '刺拳', false], ['Punch_Cross', '直拳', false], ['Roll', '翻滚', false],
  ['Jump_Start+Jump_Loop+Jump_Land', '跳跃', false], ['Interact', '互动', false], ['PickUp_Table', '拿东西', false], ['Push_Loop', '推', true],
  ['Fixing_Kneeling', '蹲下修理', true], ['Sitting_Idle_Loop', '坐着', true], ['Hit_Chest', '被打', false], ['Death01', '倒地', false],
  ['Sitting_Enter', '坐下', false], ['Sitting_Exit', '站起', false], ['Sitting_Talking_Loop', '坐着聊天', true],
  // 网页里“动作演示”的跳跃拆开用（起跳、落地之间的腾空是网页里按抛物线算的），不单独列出来
  ['Jump_Start', '起跳', false, { id: 'jump_up', hidden: true }], ['Jump_Land', '落地', false, { id: 'jump_land', hidden: true }],
];
// 原地循环的走、跑：着地那只脚每秒往后挪多少（以胯高为单位）就是人往前走的速度，网页里地面按这个速度往后滚，脚不打滑；
// phase 是左脚迈到最前面的那一刻（秒），几段步子接着播时按它对齐，左右脚不会突然换过来
const STRIDE = new Set(['walk', 'walk_formal', 'jog_fwd', 'sprint', 'crouch_fwd']);
const FPS = 30;
const chunks = [];
let off = 0;
const clipsOut = [];
function sampleClip(anim) {
  const ch = anim.channels.map((c) => {
    const s = anim.samplers[c.sampler];
    return { node: c.target.node, path: c.target.path, t: acc(s.input), v: acc(s.output), interp: s.interpolation ?? 'LINEAR' };
  });
  const dur = Math.max(...ch.map((c) => c.t[c.t.length - 1]));
  const at = (c, time) => {
    const n = { translation: 3, rotation: 4, scale: 3 }[c.path];
    const T = c.t;
    if (time <= T[0]) return Array.from(c.v.slice(0, n));
    if (time >= T[T.length - 1]) return Array.from(c.v.slice((T.length - 1) * n, T.length * n));
    let k = 0;
    while (T[k + 1] < time) k++;
    const a = Array.from(c.v.slice(k * n, k * n + n));
    if (c.interp === 'STEP') return a;
    const b = Array.from(c.v.slice((k + 1) * n, (k + 1) * n + n)), f = (time - T[k]) / (T[k + 1] - T[k]);
    if (c.path === 'rotation') { const q = new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), f); return [q.x, q.y, q.z, q.w]; }
    return a.map((x, i) => x + (b[i] - x) * f);
  };
  return { dur, frameAt: (time) => {
    const local = nodes.map((n) => ({ t: n.t, r: n.r, s: n.s }));
    for (const c of ch) local[c.node] = { ...local[c.node], [{ translation: 't', rotation: 'r', scale: 's' }[c.path]]: at(c, time) };
    return worldAt(local);
  } };
}
for (const [names, label, loop, opt = {}] of CLIPS) {
  const parts = names.split('+').map((n) => g.animations.find((a) => a.name === n));
  if (parts.some((p) => !p)) { console.log('缺', names); continue; }
  const frames = [];
  for (const a of parts) {
    const s = sampleClip(a);
    const n = Math.max(2, Math.round(s.dur * FPS) + (loop ? 0 : 1));
    for (let f = 0; f < n; f++) frames.push(s.frameAt(Math.min(s.dur, f / FPS)));
  }
  const NB = BONES.length, NF = frames.length;
  const q = new Int16Array(NF * NB * 4), hp = new Float32Array(NF * 3);
  frames.forEach((W, f) => {
    BONES.forEach((b, i) => {
      const d = rot(W[byName[srcOf[i]]]).multiply(restQ[i].clone().invert());
      // 四元数符号统一（w ≥ 0），插值时不会绕远路
      const sgn = d.w < 0 ? -1 : 1;
      q.set([d.x, d.y, d.z, d.w].map((x) => Math.round(x * sgn * 32767)), (f * NB + i) * 4);
    });
    const p = pos(W[hipsI]).sub(hipsRest).divideScalar(hipsRest.y);
    hp.set([p.x, p.y, p.z], f * 3);
  });
  const id = opt.id ?? names.split('+')[0].replace(/_Loop$/, '').toLowerCase();
  const extra = opt.hidden ? { hidden: true } : {};
  if (STRIDE.has(id)) {
    // 240 帧/秒细看：脚踝和脚尖都贴着地（离各自在整段里的最低点不到 2cm）的那些时刻，脚踝往后挪的速度取中位数。
    // 跑步每步着地只有零点一几秒，脚跟落地、脚尖蹬地那几帧脚挪得更快，只看整只脚平贴着地的时候
    const s0 = sampleClip(parts[0]), dt = 1 / 240, fr = [];
    for (let t = 0; t <= s0.dur + 1e-9; t += dt) { const W = s0.frameAt(t); fr.push(Object.fromEntries(['L', 'R'].flatMap((S) => [[`a${S}`, pos(W[byName[`DEF-foot.${S}`]])], [`t${S}`, pos(W[byName[`DEF-toe.${S}`]])]]))); }
    const v = [];
    for (const S of ['L', 'R']) {
      const alo = Math.min(...fr.map((f) => f[`a${S}`].y)), tlo = Math.min(...fr.map((f) => f[`t${S}`].y));
      for (let i = 0; i + 1 < fr.length; i++) if (fr[i][`a${S}`].y < alo + 0.02 && fr[i][`t${S}`].y < tlo + 0.02) v.push((fr[i][`a${S}`].z - fr[i + 1][`a${S}`].z) / dt);
    }
    v.sort((a, b) => a - b);
    let best = 0;
    fr.forEach((f, i) => { if (f.tL.z > fr[best].tL.z) best = i; });
    Object.assign(extra, { speed: +(v[v.length >> 1] / hipsRest.y).toFixed(3), phase: +(best * dt).toFixed(3) });
  }
  clipsOut.push({ id, label, loop, frames: NF, ...extra, q: { off, n: q.length }, hips: { off: off + q.byteLength, n: hp.length } });
  chunks.push(Buffer.from(q.buffer), Buffer.from(hp.buffer));
  off += q.byteLength + hp.byteLength;
  console.log(id.padEnd(18), label, NF, 'frames', extra.speed ? `speed ${extra.speed} hip/s phase ${extra.phase}s` : '');
}
const raw = Buffer.concat(chunks);
fs.writeFileSync(`${OUT}/anims.bin`, zlib.gzipSync(raw, { level: 9 }));
fs.writeFileSync(`${OUT}/anims.json`, JSON.stringify({ source: 'Quaternius Universal Animation Library (CC0)', fps: FPS, bones: BONES, restDir: restDir.map((v) => v.toArray().map((x) => +x.toFixed(5))), facing, clips: clipsOut }));
console.log('anims.bin', (raw.length / 1e3).toFixed(0), 'KB raw,', (fs.statSync(`${OUT}/anims.bin`).size / 1e3).toFixed(0), 'KB gz');
