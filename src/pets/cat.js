import { profile, circle, shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { petUV } from '../materials/atlas.js';
import { sw, mapUV, frame, ccw } from './parts.js';

// 一只蜷着睡觉的橘色虎斑猫：
//   · 身子沿一条盘起来的脊背扫出来：椭圆截面（趴着，宽比高大），屁股圆、胸口细一点、脖子更细，肚皮贴着垫子；
//     贴图按“沿脊背 × 绕截面”展开，一道道深色条纹横过背上，到肚皮上淡成奶白；
//   · 脑袋埋在屁股那边，脸朝里、微微低着：一个车削的球（鼻子那头收窄），按“绕脸的朝向 × 离鼻尖的角度”贴猫脸；
//     两只耳朵（外面橘色、里面粉色），闭着的眼睛是两道弯弯的深色细线，一点粉鼻子；
//   · 尾巴从屁股绕过身子外侧，一直绕到鼻子前面；外侧鼓着一条后腿，两只白爪子缩在下巴底下。
// 局部原点在蜷起来的圆心、身子底下（y = 0 是垫子面），place 摆到位
const TH0 = -1.9, DTH = 4.4;                       // 脊背从屁股（TH0）逆时针盘到脖子
const RS = (t) => 0.05 - 0.008 * t;                // 脊背离圆心的距离：越往头盘得越紧（里侧的肉挤在一起，中间没有空）
const RY = 0.8;                                    // 截面的高 / 宽
const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 截面的半宽：屁股那头是圆的（从 0.3 倍长到满），胸口、脖子慢慢收细
const SIZE = (t) => (0.064 - 0.004 * t - 0.019 * sst(0.55, 1, t)) * (0.3 + 0.7 * Math.sqrt(sst(0, 0.13, t)));
const spine = (t) => { const a = TH0 + t * DTH, r = RS(t); return [r * Math.cos(a), SIZE(t) * RY, r * Math.sin(a)]; };
const tangent = (t) => { const a = spine(Math.max(0, t - 0.005)), b = spine(Math.min(1, t + 0.005)); const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return d.map((v) => v / l); };
// 脑袋：沿局部 y（脸的朝向）车削的轮廓，从后脑勺到鼻尖
const HEAD = [[0, -0.046], [0.03, -0.039], [0.044, -0.018], [0.046, 0.004], [0.041, 0.023], [0.03, 0.037], [0.017, 0.046], [0, 0.05]];
const HEAD_FLAT = 0.9;                              // 脑袋上下略扁
const headR = (y) => {
  for (let i = 0; i + 1 < HEAD.length; i++) {
    const [r0, y0] = HEAD[i], [r1, y1] = HEAD[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return 0;
};
// 脑袋表面上的一点：方向（phi 从头顶量起、psi 从鼻尖量起）上从中心往外找到表面
const headPoint = (phi, psi, lift = 0) => {
  const d = [Math.sin(psi) * Math.sin(phi), Math.cos(psi), Math.sin(psi) * Math.cos(phi) * HEAD_FLAT];
  let lo = 0, hi = 0.08;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, y = d[1] * m; (Math.hypot(d[0] * m, d[2] * m / HEAD_FLAT) < headR(y) ? (lo = m) : (hi = m)); }
  const m = lo + lift;
  return [d[0] * m, d[1] * m, d[2] * m];
};

// 脸（水平投影）在局部里的朝向角（绕 y，atan2(x, z)）：摆的时候用它让脸朝着想要的方向
export function catFaceYaw() {
  const T1 = tangent(1), a = TH0 + DTH;
  return Math.atan2(T1[0] * 0.9 - Math.cos(a) * 0.3, T1[2] * 0.9 - Math.sin(a) * 0.3);
}

export function cat(k, place) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };

  // —— 身子 ——
  {
    const n = q(36, 22, 12);
    const ts = [0, 0.012, 0.03, 0.055, 0.085, 0.12, ...Array.from({ length: n - 5 }, (_, i) => 0.12 + (0.88 * (i + 1)) / (n - 5))];
    const path = ts.map(spine);
    const sh = circle(1, q(18, 12, 8), { rx: 1, ry: RY });
    const S = [0];
    for (let i = 1; i < path.length; i++) S.push(S[i - 1] + Math.hypot(...path[i].map((v, j) => v - path[i - 1][j])));
    const L = S[S.length - 1];
    // scale 收到的是弧长比例：换回 t 再取截面大小
    const tOf = (f) => { const s = f * L; let i = 1; while (i < S.length - 1 && S[i] < s) i++; return ts[i - 1] + ((ts[i] - ts[i - 1]) * (s - S[i - 1])) / (S[i] - S[i - 1] || 1); };
    const body = k.sweep({ name: 'catBody', mat: 'pet', shape: sh, path, up: [0, 1, 0], scale: (f) => SIZE(tOf(f)) });
    body.T = body.T.map(([s, a]) => petUV('fur', Math.min(1, s / L), ((a / sh.length) % 1 + 1) % 1));
    body.transform(place);
  }

  // —— 后腿（外侧鼓起来的大腿）和后爪 ——
  {
    const t = 0.16, c = spine(t), T = tangent(t), out = [Math.cos(TH0 + t * DTH), 0, Math.sin(TH0 + t * DTH)];
    const ctr = [c[0] + out[0] * 0.03, c[1] + 0.002, c[2] + out[2] * 0.03];
    const up = [0, 1, 0], side = [T[1] * up[2] - T[2] * up[1], T[2] * up[0] - T[0] * up[2], T[0] * up[1] - T[1] * up[0]];
    const F = frame(side, T, up, ctr);
    const thigh = k.lathe({ name: 'catThigh', mat: 'pet', segs: q(18, 12, 8), profile: profile([[0, -0.05], [0.022, -0.045, sm], [0.035, -0.028, sm], [0.04, -0.004, sm], [0.036, 0.022, sm], [0.022, 0.042, sm], [0, 0.05]]) });
    thigh.deform(([x, y, z]) => [x, y, z * 0.95]);
    mapUV(thigh, (p) => petUV('fur', 0.08 + (p[1] + 0.056) * 1.1, 0.12 + 0.12 * (p[2] / 0.05)));
    thigh.transform(place.mul(F));
    const pawC = [ctr[0] + T[0] * 0.04 - out[0] * 0.004, 0.011, ctr[2] + T[2] * 0.04 - out[2] * 0.004];
    sw(k.lathe({ name: 'catHindPaw', mat: 'pet', segs: q(10, 6, 4), profile: profile([[0, -0.02], [0.01, -0.015, sm], [0.012, 0, sm], [0.01, 0.015, sm], [0, 0.02]]), xf: place.mul(frame(side, T, up, pawC)) }), 'catCream');
  }

  // —— 脑袋：接在脖子前面，脸朝圆心里偏一点、低一点 ——
  const T1 = tangent(1), p1 = spine(1);
  const inward = [-Math.cos(TH0 + DTH), 0, -Math.sin(TH0 + DTH)];
  const face0 = [T1[0] * 0.9 + inward[0] * 0.3, -0.26, T1[2] * 0.9 + inward[2] * 0.3];
  const fl = Math.hypot(...face0), face = face0.map((v) => v / fl);
  const hc = [p1[0] + T1[0] * 0.036, 0.047, p1[2] + T1[2] * 0.036];
  // 头的局部：y = 脸的朝向，z = 头顶，x = y × z
  const up0 = [0, 1, 0], d = face[0] * up0[0] + face[1] * up0[1] + face[2] * up0[2];
  const top0 = [up0[0] - face[0] * d, up0[1] - face[1] * d, up0[2] - face[2] * d], tl = Math.hypot(...top0);
  const top = top0.map((v) => v / tl);
  const hx = [face[1] * top[2] - face[2] * top[1], face[2] * top[0] - face[0] * top[2], face[0] * top[1] - face[1] * top[0]];
  const H = place.mul(frame(hx, face, top, hc));
  {
    const pr = profile(HEAD.map(([r, y], i) => [r, y, i > 0 && i < HEAD.length - 1 ? sm : {}]));
    const head = k.lathe({ name: 'catHead', mat: 'pet', segs: q(16, 12, 8), grain: 'around', profile: pr });
    const rmax = Math.max(...HEAD.map((p) => p[0]));
    head.T = head.T.map(([a, s]) => petUV('head', a / (2 * Math.PI * rmax), 1 - s / pr.length));
    head.deform(([x, y, z]) => [x, y, z * HEAD_FLAT]);
    head.transform(H);
  }
  // 耳朵：外面橘色、里面一片粉的，竖在头顶两侧、往外、往后撇。耳朵平面朝前（挤出的厚度沿脸的朝向）
  for (const s of [-1, 1]) {
    const E = H.mul(xf({ pos: headPoint(s * 0.62, 1.5, -0.004) })).mul(xf({ rot: [0.3, s * 0.38, 0] })).mul(xf({ rot: [Math.PI / 2, 0, 0] }));
    sw(k.extrude({ name: `catEar${s > 0 ? 'R' : 'L'}`, mat: 'pet', shape: shape(ccw([[-0.017, 0], [0.017, 0], [s * 0.004, 0.032]]), { r: 0.003, segs: 1 }), depth: 0.007, center: true, bevel: q(0.002, 0.0015, 0), xf: E }), 'catOrange');
    if (k.lod < 2) sw(k.extrude({ name: `catEarIn${s > 0 ? 'R' : 'L'}`, mat: 'pet', shape: shape(ccw([[-0.011, 0.004], [0.011, 0.004], [s * 0.003, 0.026]])), depth: 0.0015, center: true, xf: E.mul(xf({ pos: [0, 0, -0.0042] })) }), 'earPink');
  }
  // 闭着的眼睛：一道往下弯的细线；粉鼻子
  if (k.lod < 2) {
    for (const s of [-1, 1]) {
      const pts = [-1, -0.5, 0, 0.5, 1].map((u) => headPoint(s * (0.98 + 0.2 * u), 0.72 + 0.035 * (1 - u * u), 0.0006));
      sw(k.sweep({ name: `catEye${s > 0 ? 'R' : 'L'}`, mat: 'pet', shape: circle(0.0012, 5), path: pts, up: [0, 1, 0], xf: H }), 'eyeLine');
    }
  }
  sw(k.lathe({ name: 'catNose', mat: 'pet', segs: 3, profile: profile([[0.0055, 0], [0, 0.003]]), xf: H.mul(xf({ pos: headPoint(0, 0.16, -0.0015), rot: [0.16, 0, 0] })) }), 'nosePink');

  // —— 两只前爪缩在下巴底下（白爪子）——
  for (const s of [-1, 1]) {
    const c = [hc[0] + face[0] * 0.012 + hx[0] * s * 0.022, 0.013, hc[2] + face[2] * 0.012 + hx[2] * s * 0.022];
    const f2 = [face[0], 0, face[2]], l2 = Math.hypot(...f2);
    const fw = f2.map((v) => v / l2), sd = [-fw[2], 0, fw[0]];
    sw(k.lathe({ name: `catPaw${s > 0 ? 'R' : 'L'}`, mat: 'pet', segs: q(10, 6, 4), profile: profile([[0, -0.028], [0.012, -0.022, sm], [0.014, 0, sm], [0.012, 0.02, sm], [0, 0.026]]), xf: place.mul(frame(sd, fw, [0, 1, 0], c)) }), 'catCream');
  }

  // —— 尾巴：从屁股里长出来（尾根藏在屁股里），绕过身子外侧，尾尖绕到鼻子前面 ——
  {
    const n = q(20, 13, 8), rt = (f) => 0.017 - 0.006 * f;
    const path = Array.from({ length: n + 1 }, (_, i) => {
      const f = i / n, a = TH0 + 0.3 - f * 2.1, R = 0.06 + 0.078 * sst(0, 0.2, f) - 0.034 * f * f;
      return [R * Math.cos(a), rt(f) + 0.002 + 0.034 * (1 - sst(0, 0.25, f)), R * Math.sin(a)];
    });
    let L = 0;
    for (let i = 1; i < path.length; i++) L += Math.hypot(...path[i].map((v, j) => v - path[i - 1][j]));
    const sh = circle(1, q(10, 7, 5));
    const tail = k.sweep({ name: 'catTail', mat: 'pet', shape: sh, path, up: [0, 1, 0], scale: (f) => rt(f) });
    tail.T = tail.T.map(([s, a]) => petUV('fur', Math.min(1, s / L), ((a / sh.length) % 1 + 1) % 1));
    tail.transform(place);
  }
}
