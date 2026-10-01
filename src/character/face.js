import { quadNormals } from './subdiv.js';
import { EYE_RINGS } from './topology.js';

// 脸上“画”的东西：
//   眉毛 —— 一条贴着眉弓的薄片（几何体），沿眉形从眉头到眉尾逐渐变细；高低、角度、弧度、粗细、长短都是参数，
//          挑眉 / 皱眉的表情也是动这条线；颜色跟着头发
//   顶点色 —— 皮肤的底色、嘴唇、腮红、睫毛线、鼻翼、耳廓、胡茬，全画在身体控制点的颜色上，跟着细分一起磨得很柔和

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// —— 眉毛（头部局部坐标）——
export function browMesh(F, sdf, p) {
  const E = F.eye;
  const P = [], Q = [];
  const N = 12, ROWS = 3;
  const up = (p.browUp ?? 0) * 0.0045, down = (p.browDown ?? 0) * 0.0035;
  for (const side of [1, -1]) {
    const thick = 0.0058 * (1 + 0.38 * p.browThick) * (1 - 0.18 * F.s);
    const len = 1 + 0.12 * p.browLength;
    const y0 = 0.0262 + 0.0055 * p.browHeight + E.y * 0.6;
    const inner = [0.0118 + 0.002 * (1 - F.s) - down * 0.6, y0 + up - down];
    const outer = [(E.x + 0.0215) * len, y0 - 0.002 + 0.0045 * p.browAngle - 0.0015 * F.s + up * 0.3];
    const peak = [lerp(inner[0], outer[0], 0.62), Math.max(inner[1], outer[1]) + 0.0035 + 0.0032 * p.browArch + 0.001 * F.s + up * 0.6];
    const base = P.length;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // 二次贝塞尔：眉头 → 眉峰（控制点）→ 眉尾
      const c = [2 * peak[0] - 0.5 * (inner[0] + outer[0]), 2 * peak[1] - 0.5 * (inner[1] + outer[1])];
      const x = (1 - t) ** 2 * inner[0] + 2 * t * (1 - t) * c[0] + t * t * outer[0];
      const y = (1 - t) ** 2 * inner[1] + 2 * t * (1 - t) * c[1] + t * t * outer[1];
      // 宽度：眉头最粗（略方），眉尾收成一根线
      const w = thick * (t < 0.25 ? lerp(0.82, 1, t / 0.25) : lerp(1, 0.16, sstep(0.25, 1, t)));
      for (let k = 0; k < ROWS; k++) {
        const v = (k / (ROWS - 1) - 0.5) * w;
        const q = front(sdf, side * x, y + v);
        const lift = k === 1 ? 0.0013 : 0.0007;
        const g = gradN(sdf, q);
        P.push([q[0] + g[0] * lift, q[1] + g[1] * lift, q[2] + g[2] * lift]);
      }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < ROWS - 1; k++) {
      const a = base + i * ROWS + k, b = base + (i + 1) * ROWS + k;
      if (side > 0) Q.push(a, b, b + 1, a + 1); else Q.push(a, a + 1, b + 1, b);
    }
  }
  return { P, Q };
}

function front(sdf, x, y) {
  let a = 0.02, b = 0.14; // a 在里面，b 在外面
  for (let i = 0; i < 22; i++) { const m = (a + b) / 2; if (sdf(x, y, m) < 0) a = m; else b = m; }
  return [x, y, (a + b) / 2];
}
function gradN(sdf, q) {
  const h = 2e-4;
  const g = [sdf(q[0] + h, q[1], q[2]) - sdf(q[0] - h, q[1], q[2]), sdf(q[0], q[1] + h, q[2]) - sdf(q[0], q[1] - h, q[2]), sdf(q[0], q[1], q[2] + h) - sdf(q[0], q[1], q[2] - h)];
  const l = Math.hypot(...g) || 1;
  return [g[0] / l, g[1] / l, g[2] / l];
}

// 头部局部坐标的网格 → 世界坐标的 BufferGeometry 数据
export function toWorld({ P, Q }, O, g) {
  const n = P.length;
  const pos = new Float32Array(n * 3);
  P.forEach((p, i) => { pos[i * 3] = O[0] + p[0] * g; pos[i * 3 + 1] = O[1] + p[1] * g; pos[i * 3 + 2] = O[2] + p[2] * g; });
  const q = Int32Array.from(Q);
  const nrm = quadNormals(q, pos);
  const idx = new Uint32Array((q.length / 4) * 6);
  for (let i = 0, t = 0; i < q.length; i += 4) {
    idx[t++] = q[i]; idx[t++] = q[i + 1]; idx[t++] = q[i + 2];
    idx[t++] = q[i]; idx[t++] = q[i + 2]; idx[t++] = q[i + 3];
  }
  return { position: pos, normal: nrm, index: idx };
}

// —— 顶点色 ——
const hex = (c) => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const lin = (c) => c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// look：{ skin, lips, blush (0…1), stubble (0…1), liner (0…1) }，颜色是 #rrggbb
export function cageColors(topo, look) {
  const skin = lin(hex(look.skin));
  const lips = lin(hex(look.lips));
  const C = new Float32Array(topo.n * 3);
  const put = (v, c) => { if (v >= 0) { C[v * 3] = c[0]; C[v * 3 + 1] = c[1]; C[v * 3 + 2] = c[2]; } };
  const get = (v) => [C[v * 3], C[v * 3 + 1], C[v * 3 + 2]];
  for (let v = 0; v < topo.n; v++) put(v, skin);
  const warm = mixc(skin, lin(hex('#c8695f')), 0.22); // 血色重一点的地方
  const shade = (v, c, t) => { if (v >= 0) put(v, mixc(get(v), c, t)); };
  const H = topo.H;
  // 嘴唇：唇线一圈半染，唇峰、唇内缘全染
  const lipK = look.lipK ?? 0.72;
  topo.mouth.forEach((ring, i) => { if (i === 0) return; ring.forEach((v) => shade(v, lips, (i === 1 ? 0.4 : 1) * lipK)); });
  // 腮红：苹果肌一带
  const blush = look.blush ?? 0.3;
  for (const r of [6, 7, 8]) for (const j of [2, 3, 17, 18]) shade(H[r][j], mixc(skin, lin(hex('#e07f7f')), 0.75), blush * (r === 7 ? 0.55 : 0.32));
  // 鼻尖、鼻翼、耳朵：透一点血色；鼻翼根部暗一点
  shade(H[7][0], warm, 0.5);
  for (const j of [1, 19]) shade(H[6][j], mixc(warm, [0.1, 0.06, 0.05], 0.25), 0.55);
  for (const ear of topo.ears) ear.forEach((ring, i) => { if (i > 0) ring.forEach((v) => shade(v, warm, 0.55)); });
  // 睫毛线：上睑缘深、下睑缘浅；眼睑外侧（双眼皮褶）带一点阴影
  const liner = look.liner ?? 0.6;
  const lash = lin(hex('#2a1d18'));
  topo.eyes.forEach((rings) => {
    rings[EYE_RINGS - 1].forEach((v, k) => shade(v, lash, k >= 1 && k <= 3 ? 0.55 * liner + 0.25 : k === 0 || k === 4 ? 0.35 * liner + 0.1 : 0.12 + 0.1 * liner));
    rings[EYE_RINGS].forEach((v, k) => shade(v, lash, k >= 1 && k <= 3 ? 0.85 * liner + 0.1 : 0.3));
    rings[1].forEach((v, k) => shade(v, mixc(skin, lin(hex('#8a5a52')), 1), k >= 1 && k <= 3 ? 0.18 : 0.08));
  });
  // 胡茬：下巴、两腮、上唇，偏青灰
  const stubble = look.stubble ?? 0;
  if (stubble > 0) {
    const tone = mixc(skin, lin(hex('#3d3a3a')), 0.55);
    for (let r = 0; r <= 6; r++) for (let j = 0; j < 20; j++) {
      const h = j <= 10 ? j : 20 - j;
      if (h > 6) continue;
      const v = H[r][j];
      if (v < 0) continue;
      const k = (r <= 1 ? 0.8 : r <= 3 ? 1 : r === 5 ? (h <= 2 ? 0.9 : 0.4) : r === 6 ? (h <= 1 ? 0 : 0.15) : 0.6) * (h >= 5 ? 0.6 : 1);
      shade(v, tone, stubble * k * 0.75);
    }
    topo.mouth[0].forEach((v, k) => shade(v, tone, stubble * (k >= 6 && k <= 10 ? 0.7 : 0.6)));
  }
  // 手指尖、脚趾、手肘、膝盖：一点点血色
  for (const arm of topo.arms) {
    arm.fingers.forEach((f) => f.slice(2).forEach((ring) => ring.forEach((v) => shade(v, warm, 0.35))));
    arm.thumb.slice(2).forEach((ring) => ring.forEach((v) => shade(v, warm, 0.35)));
    arm.A[5].forEach((v) => shade(v, warm, 0.18));
  }
  for (const leg of topo.legs) leg.L[5].forEach((v) => shade(v, warm, 0.15));
  return C;
}

