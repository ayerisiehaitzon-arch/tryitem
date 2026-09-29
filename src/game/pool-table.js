import { shape, rect, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { curve } from '../decor/profiles.js';
import { revolve } from '../decor/revolve.js';
import { ballUV } from '../materials/atlas.js';
import { sw, ccw, arcPts } from './parts.js';

// 台球桌：7 尺的红木美式台球桌，台面上摆着一架球。
//   · 台面：台呢包着的石板，六个袋口是在台面轮廓上真正挖出来的缺口（角袋切掉台面的角，中袋在长边中间挖半个圆），
//     缺口的侧壁也包着台呢；
//   · 库边：六段，截面是库边胶（斜面的鼻尖、顶上平）沿库边挤出，两头按袋口斜切 —— 角袋的袋角约 44°，中袋只斜 11°；
//   · 木库：四块，框的四个角斜接（接缝正好穿过角袋的圆心），内沿按袋口挖出圆弧的缺口，顶面倒圆；
//     库面上 18 颗菱形的珠母贝镶嵌（长库每边 6 颗、短库 3 颗）；袋口一圈皮的包边，底下吊着皮的袋兜；
//   · 裙板一圈，底边一道外凸的线脚；四条车削的粗腿（脚、细颈、大鼓肚、领圈）；
//   · 球：15 颗编号球按八球的摆法摆在置球点上（三角框还套着），白球在开球区；每颗球是车削的球面，贴图按经纬展开，
//     号码圈转向不同的方向；一根分段车削的球杆斜躺在台面上（胶尾、乌木杆尾、黑色缠手、枫木杆身、白色的皮头箍、蓝色的皮头），
//     角上一块巧粉。
// 原点在占地中心（地面上），长边沿 x
const T = { L: 1.98, W: 0.99, bed: 0.755, c: 0.045, rw: 0.12, h: 0.045 };
const IN = { x: T.L / 2 + T.c, z: T.W / 2 + T.c };              // 木库内沿（库边背后）
const OUT = { x: IN.x + T.rw, z: IN.z + T.rw };                  // 木库外沿
const PK = { corner: { off: 0.022, r: 0.058 }, side: { off: 0.038, r: 0.062 } };
const R = 0.0286;                                                // 球的半径（57.2mm）
const cornerC = (sx, sz) => [sx * (T.L / 2 + PK.corner.off), sz * (T.W / 2 + PK.corner.off)];
const sideC = (sz) => [0, sz * (T.W / 2 + PK.side.off)];

// 圆和一条水平线 z = z0 的交点在圆心哪一侧的角度
const angZ = (c, r, z0, sgn) => Math.atan2(z0 - c[1], sgn * Math.sqrt(r * r - (z0 - c[1]) ** 2));
const angX = (c, r, x0, sgn) => Math.atan2(sgn * Math.sqrt(r * r - (x0 - c[0]) ** 2), x0 - c[0]);
// 从 a0 往 a1 走（dir = +1 逆时针 / -1 顺时针），保证走的是指定方向
function arcDir(c, r, a0, a1, dir, n) {
  let d = a1 - a0;
  if (dir > 0) while (d <= 0) d += 2 * Math.PI;
  else while (d >= 0) d -= 2 * Math.PI;
  return arcPts(c, r, a0, a0 + d, n);
}

export default {
  id: 'pool_table',
  name: '台球桌',
  nameEn: 'Pool Table',
  category: 'game',
  aoDensity: 130,
  shadow: { margin: 0.3, maxDist: 0.7, density: 50 },
  view: { el: 30, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const nC = q(8, 5, 3), nS = q(10, 6, 4);
    const { bed } = T;
    const rC = PK.corner.r, rS = PK.side.r;

    // —— 台面：台呢包着的石板，六个袋口挖成缺口 ——
    {
      // 右半边：从右边中点往上，绕过右前角袋（从台面里面绕），沿前边走到中袋、绕半个中袋到正中；
      // 再镜像出左半边（前半圈），最后镜像出后半圈
      const cF = cornerC(1, 1), sF = sideC(1);
      const right = [
        [IN.x, 0],
        ...arcDir(cF, rC, angX(cF, rC, IN.x, -1), angZ(cF, rC, IN.z, -1), -1, nC),
        ...arcDir(sF, rS, angZ(sF, rS, IN.z, 1), -Math.PI / 2, -1, Math.ceil(nS / 2)),
      ];
      const front = [...right, ...right.slice(1, -1).reverse().map(([x, z]) => [-x, z]), [-IN.x, 0]];
      const all = [...front, ...front.slice(1, -1).reverse().map(([x, z]) => [x, -z])];
      // (x, z) → 挤出轴 'y' 的截面坐标 (x, -z)
      const sh = shape(ccw(all.map(([x, z]) => [x, -z, {}])));
      k.extrude({ name: 'bed', mat: 'baize', shape: sh, depth: 0.03, axis: 'y', caps: [false, true], density: { cap1: 0.6 }, xf: xf({ pos: [0, bed - 0.03, 0] }) });
      // 台子底下一块封板：从下面看不穿（木库、台面的底面都不生成）
      k.box({ name: 'underside', mat: 'rosewood', size: [2 * OUT.x - 0.04, 0.01, 2 * OUT.z - 0.04], segs: 0, omit: ['px', 'nx', 'py', 'pz', 'nz'], density: { ny: 0.2 }, xf: xf({ pos: [0, bed - 0.075, 0] }) });
    }

    // —— 库边：截面沿库边挤出，两头按袋角斜切 ——
    {
      const c = T.c;
      const sec = shape(ccw([[-0.01, 0], [-c, 0], [-c, T.h], [-0.014, T.h, { r: q(0.004, 0.003, 0), segs: 1 }], [0, 0.034, { r: q(0.003, 0.002, 0), segs: 1 }]]));
      const tC = (T.L / 2 + PK.corner.off - Math.sqrt(rC * rC - (c - PK.corner.off) ** 2) - (T.L / 2 - 0.075)) / c;
      const tS = (0.07 - Math.sqrt(rS * rS - (c - PK.side.off) ** 2)) / c;
      const cushion = (name, len, tNeg, tPos, place) => {
        const p = k.extrude({ name, mat: 'baize', shape: sec, depth: len, axis: 'x', center: true, caps: [true, true], density: { cap0: 0.3, cap1: 0.3 } });
        // 截面的 x 取负是朝外（背后）：挤出轴 'x' 把截面 x 映射到 -z，所以局部 z 就是离开鼻尖的距离
        p.deform((v) => [v[0] + (v[0] > 0 ? tPos : -tNeg) * Math.max(0, v[2]), v[1], v[2]]);
        p.transform(place);
      };
      const lenL = T.L / 2 - 0.075 - 0.07, lenS = T.W - 2 * 0.075;
      for (const sz of [1, -1]) {
        for (const sx of [1, -1]) {
          const cx = sx * (0.07 + lenL / 2);
          // 前库（sz=1）朝外是 +z，不用转；后库转 180°（局部 +x 变成世界 -x）
          const place = xf({ pos: [cx, bed, sz * T.W / 2], rot: [0, sz > 0 ? 0 : Math.PI, 0] });
          const cornerAtLocalPos = sz > 0 ? sx > 0 : sx < 0;
          cushion(`cushion${sz > 0 ? 'F' : 'B'}${sx > 0 ? 'R' : 'L'}`, lenL, cornerAtLocalPos ? tS : tC, cornerAtLocalPos ? tC : tS, place);
        }
        const sx = sz;
        cushion(`cushion${sx > 0 ? 'R' : 'L'}`, lenS, tC, tC, xf({ pos: [sx * T.L / 2, bed, 0], rot: [0, sx * Math.PI / 2, 0] }));
      }
    }

    // —— 木库：四块，四角斜接，内沿挖出袋口 ——
    {
      const y0 = bed - 0.07, depth = T.h + 0.07;
      const a45 = Math.PI / 4;
      const cF = cornerC(1, 1), cL = cornerC(-1, 1), sF = sideC(1);
      // 前库（z > 0），再镜像出后库
      const longPts = [
        [-OUT.x, OUT.z], [OUT.x, OUT.z],
        ...arcDir(cF, rC, a45, angZ(cF, rC, IN.z, -1), 1, nC),
        ...arcDir(sF, rS, angZ(sF, rS, IN.z, 1), angZ(sF, rS, IN.z, -1), 1, nS),
        ...arcDir(cL, rC, angZ(cL, rC, IN.z, 1), Math.PI - a45, 1, nC),
      ];
      // 右库（x > 0），再镜像出左库
      const cB = cornerC(1, -1);
      const shortPts = [
        [OUT.x, -OUT.z], [OUT.x, OUT.z],
        ...arcDir(cF, rC, a45, angX(cF, rC, IN.x, -1), -1, nC),
        ...arcDir(cB, rC, angX(cB, rC, IN.x, 1), -a45, -1, nC),
      ];
      const piece = (name, pts, capAngle) => {
        const sh = shape(ccw(pts.map(([x, z]) => [x, -z, {}])));
        k.extrude({
          name, mat: 'rosewood', shape: sh, depth, axis: 'y', caps: [false, true], grain: 'across', capAngle,
          bevel: [0, { w: q(0.008, 0.006, 0.003), h: q(0.008, 0.006, 0.003) }], bsegs: q(2, 1, 1), xf: xf({ pos: [0, y0, 0] }),
        });
      };
      piece('railF', longPts, 0);
      piece('railB', longPts.map(([x, z]) => [x, -z]), 0);
      piece('railR', shortPts, Math.PI / 2);
      piece('railL', shortPts.map(([x, z]) => [-x, z]), Math.PI / 2);
      // 珠母贝的菱形镶嵌
      const top = bed + T.h + 0.0004;
      const diamond = shape([[0, -0.012], [0.007, 0], [0, 0.012], [-0.007, 0]]);
      const inlay = (name, x, z, rotY) => sw(k.extrude({ name, mat: 'game', shape: diamond, depth: 0.0008, axis: 'y', caps: [false, true], xf: xf({ pos: [x, top - 0.0008, z], rot: [0, rotY, 0] }) }), 'pearl');
      const zr = IN.z + T.rw / 2, xr = IN.x + T.rw / 2;
      let di = 0;
      for (const sz of [1, -1]) for (const kx of [-3, -2, -1, 1, 2, 3]) inlay(`sight${di++}`, (kx * T.L) / 8, sz * zr, 0);
      for (const sx of [1, -1]) for (const kz of [-1, 0, 1]) inlay(`sight${di++}`, sx * xr, (kz * T.W) / 4, Math.PI / 2);
    }

    // —— 袋口：库面上一圈皮包边（沿袋口的圆弧扫掠），底下吊着皮袋兜 ——
    {
      const trim = rect(0.016, 0.006, { corners: [0, 0, 0.003, 0.003], segs: 1 });
      const yT = bed + T.h + 0.003;
      const pockets = [];
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const c = cornerC(sx, sz);
        // 角袋的包边：从短库那头绕到长库那头（约 223°），在库面上
        const aMid = Math.atan2(sz, sx), span = 1.945;
        pockets.push({ name: `C${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, c, r: rC, a0: aMid - span, a1: aMid + span, n: q(10, 6, 4) });
      }
      for (const sz of [1, -1]) pockets.push({ name: `S${sz > 0 ? 'F' : 'B'}`, c: sideC(sz), r: rS, a0: sz > 0 ? 0.11 : Math.PI + 0.11, a1: sz > 0 ? Math.PI - 0.11 : 2 * Math.PI - 0.11, n: q(8, 5, 3) });
      for (const P of pockets) {
        const path = arcPts(P.c, P.r + 0.008, P.a0, P.a1, P.n).map(([x, z]) => [x, yT, z]);
        if (k.lod < 2) k.sweep({ name: `lip${P.name}`, mat: 'leather', shape: trim, path, up: [0, 1, 0], caps: [true, true] });
        // 袋口内壁的皮衬：一条只朝里的竖带，盖住木库缺口的切面
        const inner = arcPts(P.c, P.r - 0.0015, P.a0, P.a1, P.n).map(([x, z]) => [x, bed - 0.015, z]);
        k.sweep({ name: `liner${P.name}`, mat: 'leather', shape: profile([[0, 0.059], [0, -0.056]]), path: inner, up: [0, 1, 0], caps: [false, false] });
        k.lathe({
          name: `bag${P.name}`, mat: 'leather', segs: q(12, 8, 6), grain: 'around',
          profile: profile([[P.r + 0.004, bed - 0.06], [P.r + 0.004, bed - 0.16, { r: q(0.03, 0.02, 0.01), segs: q(3, 2, 1) }], [0, bed - 0.2]]),
          xf: xf({ pos: [P.c[0], 0, P.c[1]] }),
        });
      }
    }

    // —— 裙板、底边线脚、四条车削的腿 ——
    {
      const AX = OUT.x - 0.015, AZ = OUT.z - 0.015, y0 = 0.46, y1 = bed - 0.07, t = 0.035;
      const wood = (name, size, pos, o = {}) => k.box({ name, mat: 'rosewood', size, r: q(0.004, 0.003, 0), segs: q(1, 1, 0), xf: xf({ pos }), ...o });
      for (const s of [1, -1]) {
        wood(`apron${s > 0 ? 'F' : 'B'}`, [2 * AX, y1 - y0, t], [0, (y0 + y1) / 2, s * (AZ - t / 2)], { grain: 'x', omit: ['ny'] });
        wood(`apron${s > 0 ? 'R' : 'L'}`, [t, y1 - y0, 2 * AZ - 2 * t], [s * (AX - t / 2), (y0 + y1) / 2, 0], { grain: 'z', omit: ['ny'] });
        // 裙板上一块凸起的装饰板（四周倒角）
        wood(`panel${s > 0 ? 'F' : 'B'}`, [2 * AX - 0.34, y1 - y0 - 0.1, 0.008], [0, (y0 + y1) / 2 + 0.01, s * (AZ + 0.004)], { grain: 'x', r: q(0.003, 0.002, 0), omit: ['nz', 'pz'].filter((f) => f === (s > 0 ? 'nz' : 'pz')) });
        wood(`panel${s > 0 ? 'R' : 'L'}`, [0.008, y1 - y0 - 0.1, 2 * AZ - 0.34], [s * (AX + 0.004), (y0 + y1) / 2 + 0.01, 0], { grain: 'z', r: q(0.003, 0.002, 0), omit: [s > 0 ? 'nx' : 'px'] });
        wood(`band${s > 0 ? 'F' : 'B'}`, [2 * AX + 0.024, 0.04, t + 0.012], [0, y0 + 0.02, s * (AZ - t / 2 + 0.006)], { grain: 'x', r: q(0.008, 0.006, 0), segs: q(1, 1, 0) });
        wood(`band${s > 0 ? 'R' : 'L'}`, [t + 0.012, 0.04, 2 * AZ - 2 * t], [s * (AX - t / 2 + 0.006), y0 + 0.02, 0], { grain: 'z', r: q(0.008, 0.006, 0), segs: q(1, 1, 0) });
      }
      const leg = profile([
        [0, 0], [0.05, 0, { r: 0.005, segs: 1 }], [0.055, 0.028, sm], [0.042, 0.066, sm], [0.034, 0.1, sm], [0.058, 0.19, sm],
        [0.07, 0.25, sm], [0.06, 0.31, sm], [0.036, 0.365, sm], [0.04, 0.395], [0.056, 0.405, { r: 0.004, segs: 1 }], [0.056, y0],
      ]);
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        k.lathe({ name: `leg${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, mat: 'rosewood', segs: q(14, 9, 6), profile: leg, xf: xf({ pos: [sx * (AX - 0.07), 0, sz * (AZ - 0.07)] }) });
      }
    }

    // —— 球：八球的摆法，三角框还套着；白球在开球区 ——
    {
      const knots = [];
      for (let i = 0; i <= 8; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 8;
        knots.push([Math.max(0, R * Math.cos(a)), R * Math.sin(a), i === 0 || i === 8 ? { c: 1 } : {}]);
      }
      const cv = curve(knots);
      const segs = q(12, 8, 6), tol = q(0.0006, 0.0015, 0.003);
      const ball = (n, x, z, rx, ry) => revolve(k, {
        name: `ball${n}`, mat: 'game', cv, segs, tol, uv: (u, v) => ballUV(n, u, 1 - v),
        xf: xf({ pos: [x, bed + R, z], rot: [rx, ry, 0] }),
      });
      const foot = T.L / 4, dx = 2 * R * Math.cos(Math.PI / 6), gap = 0.0003;
      const rack = [[1], [9, 2], [10, 8, 3], [11, 7, 14, 4], [5, 13, 15, 6, 12]];
      const rnd = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
      rack.forEach((row, i) => row.forEach((n, j) => {
        ball(n, foot + i * (dx + gap), (j - i / 2) * (2 * R + gap), -0.55 - 0.5 * rnd(n), (rnd(n + 20) - 0.5) * 2.2);
      }));
      ball(0, -T.L / 4, 0.05, 0, 0);
      // 三角框：沿三角形的中心线扫一圈（拐角倒圆）
      const d = R + 0.0005 + 0.0075;
      const V = (x, z) => [x, bed + 0.014, z];
      const apex = foot - 2 * d, back = foot + 4 * dx, bz = 2 * 2 * R;
      const u = [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)];
      const tri = [V(apex, 0), V(back + 2 * d * u[0], bz + 2 * d * u[1]), V(back + 2 * d * u[0], -(bz + 2 * d * u[1]))];
      const loop = roundedPath([...tri, tri[0], tri[1]], [0, 0.016, 0.016, 0.016, 0], q(3, 2, 1)).slice(1, -1);
      sw(k.sweep({ name: 'rack', mat: 'game', shape: rect(0.015, 0.028, { r: q(0.003, 0), segs: 1 }), path: loop, closed: true, up: [0, 1, 0], caps: [false, false] }), 'maple');
    }

    // —— 球杆：斜躺在台面上，分段车削 ——
    {
      const L = 1.47, butt = [-0.95, 0.38], tip = [0.38, -0.25];
      const yaw = Math.atan2(-(tip[1] - butt[1]), tip[0] - butt[0]);
      const pitch = Math.atan2(0.0155 - 0.0065, L);   // 杆尾粗、皮头细，躺平时杆身微微往前低
      const P = xf({ pos: [butt[0], bed + 0.0155, butt[1]], rot: [0, yaw, 0] }).mul(xf({ rot: [0, 0, -Math.PI / 2 - pitch] }));
      const band = (name, sw0, pts) => sw(k.lathe({ name, mat: 'game', segs: q(10, 7, 5), profile: profile(pts), xf: P }), sw0);
      // 杆尾 15.5mm 到接牙 13.5mm，杆身再收到皮头 6.5mm
      const r = (y) => (y <= 0.74 ? 0.0155 - (0.002 * y) / 0.74 : 0.0135 - (0.007 * (y - 0.74)) / 0.73);
      band('cueBumper', 'rubber', [[0, 0], [r(0) - 0.001, 0, { r: 0.002, segs: 1 }], [r(0), 0.012]]);
      band('cueButt', 'ebony', [[r(0.012), 0.012], [r(0.2), 0.2]]);
      band('cueWrap', 'rubber', [[r(0.2) + 0.0004, 0.2], [r(0.45) + 0.0004, 0.45]]);
      band('cueForearm', 'ebony', [[r(0.45), 0.45], [r(0.73), 0.73]]);
      band('cueJoint', 'ivory', [[r(0.73) + 0.0006, 0.73], [r(0.75) + 0.0006, 0.75]]);
      band('cueShaft', 'maple', [[r(0.75), 0.75], [r(1.445), 1.445]]);
      band('cueFerrule', 'ivory', [[r(1.445), 1.445], [r(1.463), 1.463]]);
      band('cueTip', 'chalk', [[r(1.463), 1.463], [r(1.47) * 0.9, 1.469, sm], [0, L]]);
    }
    // 巧粉：左后角的库面上
    sw(k.box({ name: 'chalk', mat: 'game', size: [0.022, 0.022, 0.022], r: q(0.002, 0), segs: q(1, 0), omit: ['ny'], xf: xf({ pos: [-OUT.x + 0.075, bed + T.h + 0.011, -OUT.z + 0.06], rot: [0, 0.4, 0] }) }), 'chalk');
  },
};
