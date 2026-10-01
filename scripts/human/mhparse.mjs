// MakeHuman 资源（CC0）的纯文本解析：base.obj、.target、.mhclo、.mhmat，还有 npm 包里代理网格的 three.js JSON。
// （骨骼 .mhskel 和权重 .mhw 本来就是 JSON，build.mjs 直接读。）
// 只读文本（不碰 .npz 之类的二进制归档），全部自己解析。
import fs from 'node:fs';
import path from 'node:path';

const lines = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/);

// —— 基础网格 hm08：19158 个顶点（含帮助几何：牙齿、眼睛、睫毛、裙子、紧身衣、关节立方体），
//    面按组（g）记下，UV 按“面-顶点”给（有接缝）
export function parseObj(file) {
  const v = [], vt = [], faces = [];
  let group = null;
  for (const l of lines(file)) {
    if (l.startsWith('v ')) { const p = l.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (l.startsWith('vt ')) { const p = l.split(/\s+/); vt.push(+p[1], +p[2]); }
    else if (l.startsWith('g ')) group = l.slice(2).trim();
    else if (l.startsWith('usemtl ')) { /* 忽略 */ }
    else if (l.startsWith('f ')) {
      const p = l.split(/\s+/).slice(1).filter(Boolean);
      faces.push({ group, v: p.map((s) => +s.split('/')[0] - 1), t: p.map((s) => (s.split('/')[1] ? +s.split('/')[1] - 1 : -1)) });
    }
  }
  return { v: Float32Array.from(v), vt: Float32Array.from(vt), faces };
}

// —— 形变目标：每行 “顶点号 dx dy dz” ——
export function parseTarget(file) {
  const idx = [], d = [];
  for (const l of lines(file)) {
    if (!l || l[0] === '#') continue;
    const p = l.trim().split(/\s+/);
    if (p.length < 4) continue;
    idx.push(+p[0]); d.push(+p[1], +p[2], +p[3]);
  }
  return { idx: Uint32Array.from(idx), d: Float32Array.from(d) };
}

// —— 代理（头发、衣服、眉毛、睫毛、眼球、牙齿）：每个代理顶点 = 三个基础顶点的加权和 + 按身体尺寸缩放的偏移 ——
export function parseMhclo(file) {
  const out = { file, name: null, material: null, obj: null, scale: [null, null, null], ref: [], w: [], off: [], del: [], tags: [], zDepth: 0 };
  let mode = null;
  for (const raw of lines(file)) {
    const l = raw.trim();
    if (!l || l[0] === '#') continue;
    const p = l.split(/\s+/);
    if (mode === 'verts' && /^-?\d/.test(p[0])) {
      if (p.length === 1) { out.ref.push(+p[0], +p[0], +p[0]); out.w.push(1, 0, 0); out.off.push(0, 0, 0); }
      else { out.ref.push(+p[0], +p[1], +p[2]); out.w.push(+p[3], +p[4], +p[5]); out.off.push(+p[6], +p[7], +p[8]); }
      continue;
    }
    if (mode === 'delete_verts' && /^\d/.test(p[0])) {
      for (let i = 0; i < p.length; i++) {
        if (p[i + 1] === '-') { for (let k = +p[i]; k <= +p[i + 2]; k++) out.del.push(k); i += 2; }
        else out.del.push(+p[i]);
      }
      continue;
    }
    // 其它表头行（有的文件在 verts 之后还写了 material）不打断当前段
    switch (p[0]) {
      case 'name': out.name = p.slice(1).join(' '); break;
      case 'material': out.material = p[1]; break;
      case 'obj_file': out.obj = p[1]; break;
      case 'x_scale': out.scale[0] = [+p[1], +p[2], +p[3]]; break;
      case 'y_scale': out.scale[1] = [+p[1], +p[2], +p[3]]; break;
      case 'z_scale': out.scale[2] = [+p[1], +p[2], +p[3]]; break;
      case 'z_depth': out.zDepth = +p[1]; break;
      case 'tag': out.tags.push(p.slice(1).join(' ').toLowerCase()); break;
      case 'verts': mode = 'verts'; break;
      case 'delete_verts': mode = 'delete_verts'; break;
    }
  }
  return out;
}

// —— 材质（.mhmat）：只取贴图名和几个参数 ——
export function parseMhmat(file) {
  const m = { dir: path.dirname(file) };
  for (const raw of lines(file)) {
    const l = raw.trim();
    if (!l || l[0] === '#') continue;
    const [k, ...rest] = l.split(/\s+/);
    m[k] = rest.join(' ');
  }
  return m;
}

// three.js JSON（格式 3，npm 包 makehuman-data 里代理的网格）：顶点、四边形/三角形、每面顶点 UV
export function parseThreeJson(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const F = j.faces, uvs = j.uvs?.[0] ?? [];
  const faces = [];
  let i = 0;
  const nUvLayers = (j.uvs ?? []).filter((u) => u.length).length;
  while (i < F.length) {
    const type = F[i++];
    const quad = type & 1, hasMat = type & 2, faceUv = type & 4, faceVertUv = type & 8, faceN = type & 16, faceVertN = type & 32, faceCol = type & 64, faceVertCol = type & 128;
    const nv = quad ? 4 : 3;
    const v = F.slice(i, i + nv); i += nv;
    if (hasMat) i++;
    if (faceUv) i += nUvLayers;
    let t = null;
    if (faceVertUv) { t = F.slice(i, i + nv); i += nv * nUvLayers; }
    if (faceN) i++;
    if (faceVertN) i += nv;
    if (faceCol) i++;
    if (faceVertCol) i += nv;
    faces.push({ v, t });
  }
  return { v: Float32Array.from(j.vertices), vt: Float32Array.from(uvs), faces, meta: j.metadata, materials: j.materials };
}
