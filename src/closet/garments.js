import { circle, rect, profile } from '../core/shape.js';
import { xf, smoothstep } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { clothesUV } from '../materials/atlas.js';

// 衣帽间里的衣服、鞋、包、收纳盒。全部用衣物图集（clothes 材质）：每个部件按真实尺寸铺进自己那种面料的格子 ——
// 条纹、格子、麻花的尺度都是真的；十几件衣服、几双鞋、一只包只有一个材质、一次 draw call。
//
// 挂着的衣服（局部坐标）：原点在挂钩搭着的那根杆的中心，x 沿杆，衣服所在的平面是 yz ——
// 肩线沿 z（衣柜的进深方向），前后两片布的厚度沿 x。从衣柜正面看过去，看见的是衣服的侧面：
// 一只袖子、袖口、侧缝处的下摆 —— 细节都集中在这条边上。

export const HANG = 0.072; // 肩线（衣架横杆）在挂杆中心下面多少
const RAIL_R = 0.0095;

// 把一个部件铺进衣物图集的一格：T（米）以自身范围的中心为原点。uvOf(i) → [u, v]（米）可以换一种展开
export function fabric(part, cell, uvOf = null) {
  const T = uvOf ? part.T.map((_, i) => uvOf(i)) : part.T;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [u, v] of T) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  part.T = T.map(([u, v]) => clothesUV(cell, u - cu, v - cv));
  return part;
}

// 车削件的展开：u 沿高度，v 绕一圈的弧长 —— 从正面对折（背面是正面的镜像），一圈再长也只占半圈的宽
const aroundUV = (part, cell) => fabric(part, cell, (i) => {
  const [x, y, z] = part.P[i], r = Math.hypot(x, z);
  return [-y, r * (Math.PI / 2 - Math.abs(Math.atan2(x, z)))];
});

// 衣架的挂钩：黄铜丝从衣架的木头颈往上，往后偏一点绕过杆顶，钩尖垂在杆的前面。原点在杆中心
export function hook(k, { name, place, neck = false }) {
  const q = (...v) => k.q(...v);
  if (k.lod >= 2) return;
  const R = RAIL_R + 0.0021;
  const arc = q([205, 150, 95, 40, 0], [200, 110, 20]);
  const pts = [[0, -HANG + 0.008, 0], [0, -0.036, 0], [0, -0.019, -0.9 * R]];
  for (const a of arc) pts.push([0, R * Math.sin((a * Math.PI) / 180), R * Math.cos((a * Math.PI) / 180)]);
  // 三棱的细铜丝：1.8mm 粗，平滑法线下看不出是三棱
  k.sweep({ name, mat: 'brass', shape: circle(0.0018, 3), caps: [false, true], up: [1, 0, 0], path: pts.map((p) => place.apply(p)) });
  // 衣架的木头颈（钩子插进去的地方；有领子的衣服领子挡着，不用做）
  if (neck) {
    k.lathe({
      name: `${name}Neck`, mat: 'walnut', segs: 5,
      profile: profile([[0.0065, 0], [0.0065, 0.018], [0, 0.018]]), xf: place.mul(xf({ pos: [0, -HANG - 0.008, 0] })),
    });
  }
}

// —— 挂着的一件衣服 ——
//   W 肩宽（沿 z）、L 衣长（肩线往下）、t 衣身厚、flare 下摆放宽（比例）、shirttail 下摆两侧比中间高多少、
//   slope 肩斜、sleeve { to 袖口在肩线下多少, t 袖子加的厚, w 袖宽 }、collar 'shirt' | 'coat'、top 领口在肩线下多少（吊带裙）、
//   folds [褶数, 最大深度]、lean 下摆往一边飘
export function garment(k, spec, place) {
  const q = (...v) => k.q(...v);
  const {
    name, cell, W, L, t, flare = 0, chest = 0.1, waist = 0, shirttail = 0, slope = 0.055, sleeve = null, collar = null, top = 0,
    folds = [3, 0.006], lean = 0, straps = false, neck = false, face = 0,
  } = spec;
  const rnd = k.rand(name);
  const ph = [rnd() * 6.283, rnd() * 6.283];
  const yS = -HANG;
  // 每一面几个点：一排最边上那件看得见正面，褶要画得出来，点多一些
  const Kf = face ? q(8, 5, 2) : q(4, 3, 2);
  // 宽度随高度变：肩 → 腋下放宽（chest）、连衣裙收腰（waist）、下摆放宽（flare）
  const Wd = (d) => {
    const f = d / L;
    return W * (1 + chest * smoothstep(0, 0.25, f) - waist * Math.exp(-(((f - 0.38) / 0.12) ** 2)) + flare * smoothstep(0.35, 1, f));
  };
  const lam = W / folds[0];
  const amp = (d) => folds[1] * smoothstep(0.1 * L, 0.9 * L, d);
  const xc = (z, d) => amp(d) * (Math.sin((2 * Math.PI * z) / lam + ph[0]) + 0.45 * Math.sin((2 * Math.PI * z) / (0.55 * lam) + ph[1]))
    + lean * smoothstep(0.3 * L, L, d);
  // 袖子：肩头长出来（袖山），一直到袖口；只在衣服的两端（z = ±W/2 附近）加厚
  const sl = (d) => (sleeve && d <= sleeve.to ? sleeve.t * smoothstep(0, 0.07, d) : 0);
  const sb = (z, Wz) => (sleeve ? smoothstep(Wz / 2 - sleeve.w, Wz / 2 - sleeve.w * 0.35, Math.abs(z)) : 0);
  // 一圈截面：从背后那一端（z = -W/2）出发，沿 +x 那一面走到前端，再沿 -x 那一面回来
  const ringAt = (d0) => {
    const Wz = Wd(d0);
    const e = Math.min(0.02, Wz * 0.06);
    // 这一圈的高度随 z 变：最上面一圈是肩斜，最下面一圈是衬衫下摆的弧线
    const yOf = (z) => {
      const s = (2 * z) / Wz;
      const sh = slope * s * s * Math.max(0, 1 - (d0 - top) / 0.2);
      const hem = -shirttail * s * s * smoothstep(L - 0.12, L, d0);
      return yS - d0 - sh - hem;
    };
    // 衣身是一只压扁的布筒：中间厚、两头薄（再加上袖子）
    const hT = (z) => { const s = (2 * z) / Wz; return (t / 2) * (0.55 + 0.45 * (1 - s * s)) + sl(d0) * sb(z, Wz) / 2; };
    const pts = [], hint = [];
    const tip = (z, s) => { pts.push([xc(z, d0), yOf(z), z]); hint.push([0, 0, s]); };
    tip(-Wz / 2, -1);
    for (let j = 0; j < Kf; j++) {
      const z = -Wz / 2 + e + ((Wz - 2 * e) * j) / (Kf - 1);
      pts.push([xc(z, d0) + hT(z), yOf(z), z]); hint.push([1, 0, 0]);
    }
    tip(Wz / 2, 1);
    for (let j = Kf - 1; j >= 0; j--) {
      const z = -Wz / 2 + e + ((Wz - 2 * e) * j) / (Kf - 1);
      pts.push([xc(z, d0) - hT(z), yOf(z), z]); hint.push([-1, 0, 0]);
    }
    return { pts, hint };
  };
  // 截面的高度：领口（肩线）、袖山、袖口前后两圈（袖子在这里突然收掉）、下摆
  let ds = [top, top + 0.07];
  const cuff = sleeve && k.lod < 2 ? [sleeve.to - 0.004, sleeve.to + 0.012] : [];
  ds.push(...cuff);
  ds.push(...q([0.45, 0.75], [0.6], []).map((f) => top + (L - top) * f).filter((d) => cuff.every((c) => Math.abs(c - d) > 0.05)), L);
  if (k.lod >= 2) ds = [top, L];
  ds = [...new Set(ds)].sort((a, b) => b - a); // 从下往上
  const rings = ds.map(ringAt);
  const n = rings[0].pts.length;
  const body = k.loft({
    name, mat: 'clothes', rings: rings.map((r) => r.pts), caps: [false, true],
    orient: (i, j) => rings[i].hint[j],
  });
  // 展开：侧面 u 沿高度，v 是绕一圈的弧长从前端对折；顶面接着侧面往上
  const side = (n + 1) * rings.length;
  const Vmax = body.T[side - 1][1];
  fabric(body, cell, (i) => {
    if (i >= side) { const p = body.P[i]; return [Vmax + Math.abs(p[0]) * 0.5, p[2]]; }
    const [U, V] = body.T[i];
    const per = body.T[Math.floor(i / (n + 1)) * (n + 1) + n][0];
    return [V, Math.min(U, per - U) - per / 4];
  });
  body.transform(place);

  // 领子：一圈斜着的窄带（单层，双面显示）
  if (collar && k.lod < 2) {
    // 领子立在肩线上面、围着衣架的颈：下沿埋进肩头一点，往上收窄（翻领的斜面）；大衣领子宽，趴在肩上
    const c = collar === 'coat'
      ? { r0: [0.06, 0.13], r1: [0.034, 0.07], y0: yS - 0.05 - top, y1: yS + 0.028 - top }
      : { r0: [0.033, 0.07], r1: [0.025, 0.058], y0: yS - 0.012 - top, y1: yS + 0.026 - top };
    const m = q(10, 7);
    const ell = ([rx, rz], y) => Array.from({ length: m }, (_, j) => {
      const a = Math.PI + (2 * Math.PI * j) / m;
      return [rx * Math.sin(a), y, rz * Math.cos(a)];
    });
    const cl = k.loft({ name: `${name}Collar`, mat: 'clothes', rings: [ell(c.r0, c.y0), ell(c.r1, c.y1)] });
    fabric(cl, cell, (i) => {
      const [U, V] = cl.T[i], per = cl.T[Math.floor(i / (m + 1)) * (m + 1) + m][0];
      return [V, Math.min(U, per - U) - per / 4];
    });
    cl.transform(place);
  }
  // 吊带：从领口两边拉到衣架横杆的两头；衣架横杆露在外面
  if (straps && k.lod < 2) {
    const zt = Wd(top) / 2 - 0.05;
    for (const s of [-1, 1]) {
      const a = [0, yS - top + 0.01, s * zt], b = [0, yS - 0.017, s * 0.165];
      const st = k.sweep({ name: `${name}Strap${s > 0 ? 'F' : 'B'}`, mat: 'clothes', shape: rect(0.009, 0.002), caps: [false, false], up: [1, 0, 0], path: [a, b] });
      fabric(st, cell);
      st.transform(place);
    }
    k.sweep({
      name: `${name}Hanger`, mat: 'walnut', shape: rect(0.03, 0.011), caps: [true, true], up: [1, 0, 0],
      path: [-0.2, -0.1, 0, 0.1, 0.2].map((z) => place.apply([0, yS - 0.012 - 0.03 * (z / 0.2) ** 2, z])),
    });
  }
  const surf = (z, d) => { const Wz = Wd(d), s2 = ((2 * z) / Wz) ** 2; return xc(z, d) + face * ((t / 2) * (0.55 + 0.45 * (1 - s2))); };
  // 衬衫正面的门襟：一条贴在衣身正中的窄布，从领口到下摆
  if (face && collar === 'shirt' && k.lod < 2) {
    const len = L - 0.1;
    const pk = k.box({
      name: `${name}Placket`, mat: 'clothes', size: [0.003, len, 0.03], segs: 0, div: [1, 3, 1], grain: 'y', omit: ['py', 'ny'],
      deform: (p) => { const d = 0.07 + (len / 2 - p[1]); return [surf(p[2], d) + face * 0.0016 + p[0], yS - d, p[2]]; },
    });
    fabric(pk, cell);
    pk.transform(place);
  }
  // 挂在一排最边上的衣服，看得见整个正面：袖子单独做成两条压扁的布，贴在这一面上（袖口收窄一点）
  if (face && sleeve && k.lod < 2) {
    for (const e of [-1, 1]) {
      const len = sleeve.to - 0.03, sw = sleeve.w * 0.9, st = 0.012;
      const sp = k.box({
        name: `${name}Sleeve${e > 0 ? 'F' : 'B'}`, mat: 'clothes', size: [st, len, sw], r: q(0.005, 0.004), segs: 1, div: [1, 2, 1], grain: 'y', omit: ['py'],
        deform: (p) => {
          const d = 0.03 + (len / 2 - p[1]); // 离肩线多远
          const Wz = Wd(d), zc = e * (Wz / 2 - sw / 2 + 0.012);
          const nar = 1 - 0.28 * smoothstep(0, len, d - 0.03);
          const z = zc + p[2] * nar + (e * sw * (1 - nar)) / 2;
          const x = xc(z, d) + face * ((t / 2) * (0.55 + 0.45 * (1 - ((2 * z) / Wz) ** 2)) + st / 2 + 0.001) + p[0];
          return [x, yS - d, z];
        },
      });
      fabric(sp, cell);
      sp.transform(place);
    }
  }
  hook(k, { name: `${name}Hook`, place, neck });
  return body;
}

// —— 搭在衣架横杆上的裤子 ——
// 衣架：挂钩 + 两条斜臂 + 一根横杆（胡桃木）。裤子对折以后搭在横杆上：一边是裤腰那头（宽一点），一边是裤脚（窄一点）；
// 布是一条沿横杆方向的直线截面，沿“前面垂下来 → 翻过横杆 → 后面垂下来”的路径扫掠，再加竖向的褶（只往外鼓）
export const BAR_Y = -0.2; // 衣架横杆在挂杆中心下面多少
export function trousers(k, { name, cell, w = 0.25, front = 0.48, back = 0.44, folds = 2, amp = 0.012 }, place) {
  const q = (...v) => k.q(...v);
  const rb = 0.0065, t = 0.01, rc = rb + t / 2;
  if (k.lod < 2) {
    k.sweep({
      name: `${name}Arms`, mat: 'walnut', shape: rect(0.022, 0.011), caps: [true, true], up: [1, 0, 0],
      path: roundedPath([[0, BAR_Y + 0.004, -0.19], [0, -HANG + 0.006, 0], [0, BAR_Y + 0.004, 0.19]], 0.04, q(2, 1)).map((p) => place.apply(p)),
    });
  }
  k.sweep({
    name: `${name}Bar`, mat: 'walnut', shape: circle(rb, q(6, 5, 4)), caps: [true, true], up: [1, 0, 0],
    path: [[0, BAR_Y, -0.19], [0, BAR_Y, 0.19]].map((p) => place.apply(p)),
  });
  hook(k, { name: `${name}Hook`, place });
  const rnd = k.rand(name);
  const fl = 0.012 + rnd() * 0.012, bl = 0.01 + rnd() * 0.012;
  const pts = [[rc + fl, BAR_Y - front], [rc + 0.003, BAR_Y - front * 0.5], [rc, BAR_Y - 0.015]];
  const na = q(4, 3, 2);
  for (let i = 1; i < na; i++) { const a = (Math.PI * i) / na; pts.push([rc * Math.cos(a), BAR_Y + rc * Math.sin(a)]); }
  pts.push([-rc, BAR_Y - 0.015], [-rc - 0.003, BAR_Y - back * 0.5], [-rc - bl, BAR_Y - back]);
  const nw = q(folds * 3 + 1, folds * 2 + 1, 2);
  const sec = profile(Array.from({ length: nw + 1 }, (_, i) => [0, -w / 2 + (w * i) / nw, { smooth: true }]));
  const part = k.sweep({
    name, mat: 'clothes', shape: sec, caps: [false, false], up: [0, 0, 1], maxChart: 1.2,
    path: pts.map(([x, y]) => [x, y, 0]),
    // 裤腰那头宽、裤脚那头窄
    scale: (s) => 1.12 - 0.3 * s,
  });
  if (k.lod < 2) {
    const p1 = rnd() * 6.283, p2 = rnd() * 6.283;
    part.deform((p) => {
      const d = BAR_Y - p[1];
      const side = p[0] >= 0 ? 1 : -1;
      const A = amp * smoothstep(0.03, 0.4, d);
      const s = p[2] / w + 0.5;
      const wv = Math.sin(2 * Math.PI * folds * s + p1) + 0.35 * Math.sin(2 * Math.PI * (folds + 1) * s + p2);
      return [p[0] + side * A * (0.5 + 0.37 * wv), p[1], p[2]];
    });
  }
  fabric(part, cell);
  part.transform(place);
  return part;
}

// —— 叠好的一摞毛衣：每件一个圆角盒子（折边圆润），件与件之间错开一点、转一点 ——
export function foldedStack(k, { name, items, w, d, place }) {
  const q = (...v) => k.q(...v);
  const rnd = k.rand(name);
  let y = 0;
  items.forEach(({ cell, h }, i) => {
    const dx = (rnd() - 0.5) * 0.016, dz = (rnd() - 0.5) * 0.012, yaw = (rnd() - 0.5) * 0.05;
    const ww = w * (0.96 + rnd() * 0.06), dd = d * (0.96 + rnd() * 0.05);
    const part = k.box({
      name: `${name}${i}`, mat: 'clothes', size: [ww, h, dd], r: q(Math.min(h / 2 - 0.002, 0.016), 0), segs: q(1, 0),
      grain: 'z', omit: ['ny'],
    });
    fabric(part, cell);
    part.transform(place.mul(xf({ pos: [dx, y + h / 2, dz], rot: [0, yaw, 0] })));
    y += h;
  });
  return y;
}

// —— 一只鞋：圆角盒子的形变（脚跟窄、前掌宽、鞋头收圆；鞋面从鞋口往鞋头降下去；前掌微微翘起）——
// 局部坐标：原点在鞋底中心，鞋头朝 +z。kind：'loafer' 乐福鞋 / 'boot' 短靴（多一截靴筒）/ 'sneaker' 帆布鞋（白色厚底）
function shoe(k, { name, cell, lining, sole = null, kind, L, Wd, H }, place) {
  const q = (...v) => k.q(...v);
  const hs = sole ? sole.h : 0;
  const part = k.box({
    name, mat: 'clothes', size: [Wd, H, L], r: q(0.018, 0.012, 0.006), segs: 1, div: q([1, 1, 3], [1, 1, 2], 1), grain: 'z', omit: ['ny'],
    deform: (p) => {
      const s = p[2] / (L / 2); // -1 脚跟，+1 鞋头
      const wf = s < 0.25 ? 0.8 + 0.2 * smoothstep(-1, 0.25, s) : 1 - 0.18 * smoothstep(0.25, 1, s);
      const yb = p[1] + H / 2; // 离鞋底多高
      const top = 1 - 0.46 * smoothstep(-0.25, 1.05, s);
      const spring = 0.008 * smoothstep(0.55, 1, s);
      return [p[0] * wf, hs + yb * top + spring * (1 - yb / H), p[2]];
    },
  });
  fabric(part, cell);
  part.transform(place);
  if (sole) {
    const sp = k.box({
      name: `${name}Sole`, mat: 'clothes', size: [Wd * 1.04, sole.h, L * 1.02], r: q(0.006, 0.004, 0), segs: q(1, 1, 0), div: q([1, 1, 2], 1, 1), grain: 'z', omit: ['ny'],
      deform: (p) => { const s = p[2] / (L / 2); const wf = s < 0.25 ? 0.82 + 0.18 * smoothstep(-1, 0.25, s) : 1 - 0.16 * smoothstep(0.25, 1, s); return [p[0] * wf, p[1] + sole.h / 2, p[2]]; },
    });
    fabric(sp, sole.cell);
    sp.transform(place);
  }
  // 靴筒
  let yTop = hs + H;
  if (kind === 'boot') {
    const sh = 0.1;
    const shaft = k.box({
      name: `${name}Shaft`, mat: 'clothes', size: [Wd * 0.8, sh, L * 0.42], r: q(0.022, 0.016, 0.008), segs: 1, grain: 'y', omit: ['ny'],
      xf: xf({ pos: [0, hs + H * 0.85 + sh / 2, -L * 0.25] }),
    });
    fabric(shaft, cell);
    shaft.transform(place);
    yTop = hs + H * 0.85 + sh;
  }
  // 鞋口：一片深色的椭圆（看进去是鞋里）
  if (k.lod < 2) {
    const [rx, rz, zc] = kind === 'boot' ? [Wd * 0.28, L * 0.15, -L * 0.25] : [Wd * 0.3, L * 0.16, -L * 0.28];
    const op = k.lathe({ name: `${name}Opening`, mat: 'clothes', segs: q(10, 7), profile: profile([[rx, 0], [0, 0]]) });
    op.P = op.P.map(([x, y, z]) => [x, y + yTop + 0.0008, zc + (z * rz) / rx]);
    fabric(op, lining, (i) => [op.P[i][0], op.P[i][2]]);
    op.transform(place);
  }
}

export function shoePair(k, { name, at, yaw = 0, spread = 0.1, ...spec }) {
  const rnd = k.rand(name);
  for (const s of [-1, 1]) {
    const a = yaw + s * 0.04 + (rnd() - 0.5) * 0.06;
    shoe(k, { name: `${name}${s > 0 ? 'R' : 'L'}`, ...spec }, xf({ pos: [at[0] + (s * spread) / 2, at[1], at[2] + (rnd() - 0.5) * 0.02], rot: [0, a, 0] }));
  }
}

// —— 手提包：硬挺的梯形包身、一片盖到正面一半的翻盖、黄铜扣、一根拱起来的提手 ——
// 局部坐标：原点在包底中心，正面朝 +z
// mat：默认用衣物图集（cell 指定面料格子）；也可以直接用一种平铺的皮革材质（首饰岛台上那只）
export function handbag(k, { name, cell = null, mat = 'clothes', size: [bw, bh, bd], place }) {
  const q = (...v) => k.q(...v);
  const cover = (part) => (mat === 'clothes' ? fabric(part, cell) : part);
  const h = [bw / 2, bh / 2, bd / 2];
  const body = k.box({
    name, mat, size: [bw, bh, bd], r: q(0.012, 0.008, 0.004), segs: 1, div: q([2, 2, 1], [1, 1, 1], 1), grain: 'x', omit: ['ny'],
    deform: (p) => {
      const up = (p[1] + h[1]) / bh;
      const bulge = 0.006 * (1 - (p[0] / h[0]) ** 2) * (1 - (2 * up - 1) ** 2);
      return [p[0] * (1 - 0.12 * up), p[1] + h[1], p[2] * (1 - 0.18 * up) + Math.sign(p[2]) * bulge];
    },
  });
  cover(body);
  body.transform(place);
  // 翻盖：从包顶翻过来，盖住正面上半截
  const fh = bh * 0.52;
  const flap = k.box({
    name: `${name}Flap`, mat, size: [bw * 0.9, fh, 0.004], r: q(0.006, 0.004, 0), segs: q(1, 1, 0), grain: 'x', omit: ['nz'],
    xf: xf({ pos: [0, bh - fh / 2 + 0.002, bd / 2 * (1 - 0.18 * (1 - fh / 2 / bh)) + 0.0045], rot: [-0.06, 0, 0] }),
  });
  cover(flap);
  flap.transform(place);
  if (k.lod < 2) {
    k.box({
      name: `${name}Clasp`, mat: 'brass', size: [0.03, 0.022, 0.006], segs: 0, omit: ['nz'],
      xf: place.mul(xf({ pos: [0, bh - fh + 0.012, bd / 2 * (1 - 0.18 * (1 - (fh - 0.012) / bh)) + 0.008], rot: [-0.06, 0, 0] })),
    });
    // 提手：两头插在包顶，拱起 9cm
    const hx = bw * 0.26;
    const hp = k.sweep({
      name: `${name}Handle`, mat, shape: rect(0.008, 0.018), caps: [false, false], up: [0, 0, 1],
      path: roundedPath([[-hx, bh - 0.004, 0], [-hx * 0.8, bh + 0.085, 0], [hx * 0.8, bh + 0.085, 0], [hx, bh - 0.004, 0]], 0.04, q(3, 2)),
    });
    cover(hp);
    hp.transform(place);
  }
}

// —— 帽盒：圆盒（条纹纸面）+ 盖子（侧边条纹、顶面白色）——
export function hatBox(k, { name, r = 0.17, h = 0.2, place }) {
  const q = (...v) => k.q(...v);
  const segs = q(18, 12, 8);
  const lid = 0.055;
  const side = k.lathe({ name, mat: 'clothes', segs, grain: 'around', profile: profile([[r, 0], [r, h - lid + 0.004]]) });
  aroundUV(side, 'stripe');
  side.transform(place);
  const band = k.lathe({
    name: `${name}Lid`, mat: 'clothes', segs, grain: 'around',
    profile: profile([[r + 0.001, h - lid], [r + 0.005, h - lid], [r + 0.005, h]]),
  });
  aroundUV(band, 'stripe');
  band.transform(place);
  const topP = k.lathe({ name: `${name}Top`, mat: 'clothes', segs, profile: profile([[r + 0.005, h], [0, h]]) });
  fabric(topP, 'oxford', (i) => [topP.P[i][0], topP.P[i][2]]);
  topP.transform(place);
}

// —— 亚麻收纳盒：圆角盒子 + 正面一片皮拉手 ——
export function linenBox(k, { name, size: [w, h, d], place }) {
  const q = (...v) => k.q(...v);
  const b = k.box({
    name, mat: 'clothes', size: [w, h, d], r: q(0.008, 0.006, 0), segs: q(1, 1, 0), grain: 'x', omit: ['ny'],
    xf: xf({ pos: [0, h / 2, 0] }),
  });
  fabric(b, 'linen');
  b.transform(place);
  if (k.lod < 2) {
    const tab = k.box({
      name: `${name}Tab`, mat: 'clothes', size: [0.07, 0.03, 0.006], segs: 0, grain: 'x', omit: ['nz'],
      xf: xf({ pos: [0, h * 0.62, d / 2 + 0.003] }),
    });
    fabric(tab, 'leather');
    tab.transform(place);
  }
}
