import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { jar, teapot, cup, gaiwan, plate, potRest, rock, burner, teaCake, meiping, books, toolHolder } from './teaware.js';

// 博古架（多宝格）：1.5m 宽、1.9m 高的红木架子，贴墙放。
//   · 下面是一只对开门的矮柜：门是攒边装板（门框压在往里退 6mm 的芯板上），中间一块圆形的黄铜面叶、两枚吊牌，
//     门的外沿各两片黄铜合页；柜子底下一道壸门牙板，四条腿落地；
//   · 上面是错落的多宝格：三列格子的隔板高低错开，中间一层横板跨过两列，右边那根竖隔板到了上半截往右挪了一格，
//     十一个格子大小各不相同；几个格子的上角有圆角牙子，中间一格前面是一扇月洞（圆光），里面立着一只哥窑梅瓶；
//   · 背板是燕麦色的亚麻布面，深色的木框里衬一层浅色，摆件的轮廓更清楚；
//   · 格子里的摆件：青花将军罐、壶承上的紫砂壶和品茗杯、灵璧石、两饼普洱、线装书上的铜香炉、白瓷盖碗和茶叶罐、
//     盘架上的开片大盘、茶道筒（都来自 teaware.js），留两格空着。
// 原点在背面贴墙的地方（z = 0 是墙面，架子朝 +z），y = 0 是地面
const W = 1.5, D = 0.34;       // 宽、深（高 1.9m：多宝格顶 Y1 再加 3.2cm 的顶板）
const P = 0.045;                 // 立柱截面
const T = 0.022;                 // 隔板 / 层板厚
const XI = W / 2 - P;            // 内侧 x 边界（±0.705）
const ZF = D - 0.012, ZB = 0.018; // 格子前沿（比立柱退 12mm）、后沿（背板前面）
const Y0 = 0.572, Y1 = 1.87;     // 多宝格的底（柜顶板的上表面）、顶（顶板下面）
const XA = -0.23, XB = 0.2, XC = 0.33;
// 层板：[中心高度, x0, x1]；竖隔板：[x, y0, y1]
const SHELVES = [
  [0.95, -XI, XA - T / 2], [1.38, -XI, XA - T / 2],
  [0.8, XA + T / 2, XB - T / 2], [1.2, XA + T / 2, XI], [1.56, XA + T / 2, XC - T / 2],
  [0.9, XB + T / 2, XI], [1.47, XC + T / 2, XI],
];
const DIVIDERS = [[XA, Y0, Y1], [XB, Y0, 1.2 - T / 2], [XC, 1.2 + T / 2, Y1]];
// 格子（净空）：[x0, x1, y0, y1]
const cell = (x0, x1, yb, yt) => [x0, x1, yb, yt];
const C = {
  A: cell(-XI, XA - T / 2, 1.38 + T / 2, Y1),          // 左上
  B: cell(-XI, XA - T / 2, 0.95 + T / 2, 1.38 - T / 2), // 左中
  Cc: cell(-XI, XA - T / 2, Y0, 0.95 - T / 2),          // 左下
  D: cell(XA + T / 2, XB - T / 2, Y0, 0.8 - T / 2),     // 中下
  E: cell(XA + T / 2, XB - T / 2, 0.8 + T / 2, 1.2 - T / 2),
  F: cell(XB + T / 2, XI, Y0, 0.9 - T / 2),             // 右下
  G: cell(XB + T / 2, XI, 0.9 + T / 2, 1.2 - T / 2),
  M: cell(XA + T / 2, XC - T / 2, 1.2 + T / 2, 1.56 - T / 2), // 月洞
  I: cell(XA + T / 2, XC - T / 2, 1.56 + T / 2, Y1),
  J: cell(XC + T / 2, XI, 1.2 + T / 2, 1.47 - T / 2),
  K: cell(XC + T / 2, XI, 1.47 + T / 2, Y1),
};
const cx = (c) => (c[0] + c[1]) / 2;
const ZM = (ZF + ZB) / 2;

export default {
  id: 'curio_shelf',
  name: '博古架',
  nameEn: 'Rosewood Curio Shelf',
  category: 'tea',
  planes: ['floor', 'wall'],
  aoDensity: 110,
  shadow: {
    floor: { margin: 0.2, maxDist: 0.5, density: 60 },
    wall: { margin: 0.14, maxDist: 0.35, density: 50, strength: 0.6 },
  },
  view: { el: 10, az: 22 },
  build(k) {
    const q = (...v) => k.q(...v);
    const bx = (name, size, pos, o = {}) => k.box({ name, mat: 'rosewood', size, r: q(0.003, 0.002, 0), segs: q(1, 1, 0), xf: xf({ pos }), ...o });

    // —— 框架：四根立柱、顶板、两侧板、背板 ——
    for (const [i, [sx, sz]] of [[-1, 1], [1, 1], [-1, -1], [1, -1]].entries()) {
      bx(`post${i}`, [P, Y1, P], [sx * (W / 2 - P / 2), Y1 / 2, sz > 0 ? D - P / 2 : P / 2], { grain: 'y', omit: ['ny'] });
    }
    k.box({ name: 'crown', mat: 'rosewood', size: [W + 0.04, 0.032, D + 0.025], r: q(0.008, 0.005, 0.003), segs: q(2, 1, 1), grain: 'x', xf: xf({ pos: [0, Y1 + 0.016, D / 2 + 0.0125] }) });
    for (const s of [-1, 1]) {
      // 侧板装在两根立柱之间，内侧和立柱内侧平齐
      bx(`side${s > 0 ? 'R' : 'L'}`, [0.014, Y1 - 0.1, D - 2 * P], [s * (XI + 0.007), 0.1 + (Y1 - 0.1) / 2, D / 2], { grain: 'y', segs: 0 });
    }
    // 背板：燕麦色的亚麻布面（深色的木框里衬一层浅色，摆件的轮廓更清楚）
    k.box({ name: 'back', mat: 'linen', size: [2 * XI, Y1 - 0.1, 0.012], segs: 0, grain: 'y', density: { nz: 0.2 }, xf: xf({ pos: [0, 0.1 + (Y1 - 0.1) / 2, ZB - 0.006] }) });

    // —— 多宝格：层板、竖隔板（前沿倒一点圆）——
    bx('deck', [2 * XI, T, ZF - ZB + 0.004], [0, Y0 - T / 2, ZM + 0.002], { grain: 'x' });
    SHELVES.forEach(([y, x0, x1], i) => bx(`shelf${i}`, [x1 - x0, T, ZF - ZB], [(x0 + x1) / 2, y, ZM], { grain: 'x' }));
    DIVIDERS.forEach(([x, y0, y1], i) => bx(`divider${i}`, [T, y1 - y0, ZF - ZB], [x, (y0 + y1) / 2, ZM], { grain: 'y' }));

    // —— 圆角牙子：格子上角的一小片，内侧是一道四分之一圆 ——
    const bracket = (name, x, y, sx, a = 0.055) => {
      const n = q(4, 3, 2);
      const pts = [[0, 0], [0, -a]];
      for (let i = 1; i < n; i++) {
        const f = (i / n) * (Math.PI / 2);
        pts.push([a - a * Math.cos(f), -a + a * Math.sin(f), { smooth: true }]);
      }
      pts.push([a, 0]);
      const sh = shape((sx > 0 ? pts : pts.map(([px, py, o]) => [-px, py, o]).reverse()));
      k.extrude({ name, mat: 'rosewood', shape: sh, depth: 0.012, bevel: [0, q(0.002, 0)], bsegs: 1, caps: [false, true], xf: xf({ pos: [x, y, ZF - 0.014] }) });
    };
    for (const key of ['A', 'Cc', 'E', 'G', 'K']) {
      const c = C[key];
      bracket(`bracket${key}L`, c[0], c[3], 1);
      bracket(`bracket${key}R`, c[1], c[3], -1);
    }

    // —— 月洞：格子前面一块板，中间一个圆洞；左右两半拼成（木纹接得上）——
    {
      const c = C.M, w = c[1] - c[0], h = c[3] - c[2], R = 0.148;
      const n = q(12, 8, 6);
      for (const s of [-1, 1]) {
        const arc = [];
        for (let i = 0; i <= n; i++) {
          const a = Math.PI / 2 - (Math.PI * i) / n;
          arc.push([R * Math.cos(a), R * Math.sin(a), i === 0 || i === n ? {} : { smooth: true }]);
        }
        let pts = [[0, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [0, h / 2], ...arc];
        if (s < 0) pts = pts.map(([px, py, o]) => [-px, py, o]).reverse();
        const part = k.extrude({
          name: `moon${s > 0 ? 'R' : 'L'}`, mat: 'rosewood', shape: shape(pts), depth: 0.014, bevel: [0, q(0.0025, 0.0015, 0)], bsegs: q(2, 1, 1),
          caps: [false, true], xf: xf({ pos: [cx(c), (c[2] + c[3]) / 2, ZF - 0.014] }),
        });
        part.uvKey = 'moon';
      }
      // 月洞里：一只哥窑梅瓶立在圆形小座上
      stand(k, 'meipingStand', 0.05, xf({ pos: [cx(c), c[2], ZM - 0.01] }));
      meiping(k, 'meiping', xf({ pos: [cx(c), c[2] + 0.018, ZM - 0.01] }));
    }

    // —— 下面的柜子：底板、两扇攒边装板的门、黄铜面叶和吊牌、合页；底下壸门牙板 ——
    const YB = 0.1, YT = Y0 - T;
    bx('floor', [2 * XI, 0.02, D - 2 * P + 0.06], [0, YB + 0.01, D / 2], { grain: 'x', segs: 0 });
    {
      const g = 0.003, dw = XI - 1.5 * g, dh = YT - YB - 2 * g, yc = (YB + YT) / 2, zf = D - 0.008;
      for (const s of [-1, 1]) {
        const x0 = s * (g / 2 + dw / 2), fw = 0.052;
        const nm = s > 0 ? 'R' : 'L';
        bx(`door${nm}Panel`, [dw - 0.02, dh - 0.02, 0.012], [x0, yc, zf - 0.012], { grain: 'y', segs: 0, omit: ['nz'] });
        bx(`door${nm}StileO`, [fw, dh, 0.02], [x0 + s * (dw / 2 - fw / 2), yc, zf - 0.01], { grain: 'y', omit: ['nz'] });
        bx(`door${nm}StileI`, [fw, dh, 0.02], [x0 - s * (dw / 2 - fw / 2), yc, zf - 0.01], { grain: 'y', omit: ['nz'] });
        for (const t of [-1, 1]) bx(`door${nm}Rail${t > 0 ? 'T' : 'B'}`, [dw - 2 * fw, fw, 0.02], [x0, yc + t * (dh / 2 - fw / 2), zf - 0.01], { grain: 'x', omit: ['nz'] });
        // 合页：门外沿两片
        for (const t of [-1, 1]) k.box({ name: `hinge${nm}${t > 0 ? 'T' : 'B'}`, mat: 'brass', size: [0.024, 0.056, 0.002], r: q(0.001, 0), segs: q(1, 0), omit: ['nz'], xf: xf({ pos: [s * (XI - 0.016), yc + t * (dh / 2 - 0.07), zf + 0.001] }) });
        // 吊牌
        k.box({ name: `pull${nm}`, mat: 'brass', size: [0.014, 0.034, 0.0035], r: q(0.0015, 0), segs: q(1, 0), xf: xf({ pos: [s * 0.022, yc + 0.012, zf + 0.004], rot: [0.12, 0, 0] }) });
      }
      // 面叶：一块圆形的黄铜片骑在两扇门中间
      k.lathe({
        name: 'faceplate', mat: 'brass', segs: q(14, 10, 6),
        profile: profile([[0.036, 0], [0.036, 0.0015, { r: 0.0008, segs: 1 }], [0.03, 0.0022, { smooth: true }], [0, 0.0024]]),
        xf: xf({ pos: [0, yc + 0.05, zf], rot: [Math.PI / 2, 0, 0] }),
      });
    }
    // 壸门牙板：正面一道，两侧各一道。下沿从两头往中间拱起，到正中两道弧收成一个往下垂的小尖
    const apron = (name, len, place) => {
      const n = q(8, 5, 3), top = 0.105, low = 0.05, rise = 0.034, half = len / 2 - 0.02;
      const yAt = (t) => low + rise * (t < 0.82 ? Math.sin((Math.PI / 2) * (t / 0.82)) : 1 - 0.35 * ((t - 0.82) / 0.18) ** 1.4);
      const ts = [...Array.from({ length: n }, (_, i) => (0.82 * i) / (n - 1)), 1];
      const pts = [[-len / 2, top], [-len / 2, low, { r: q(0.006, 0) }]];
      ts.forEach((t, i) => pts.push([-half + half * t, yAt(t), i === 0 || i === ts.length - 1 ? {} : { smooth: true }]));
      for (let i = ts.length - 2; i >= 0; i--) pts.push([half - half * ts[i], yAt(ts[i]), i === 0 ? {} : { smooth: true }]);
      pts.push([len / 2, low, { r: q(0.006, 0) }], [len / 2, top]);
      k.extrude({ name, mat: 'rosewood', shape: shape(pts), depth: 0.016, bevel: [0, q(0.002, 0)], bsegs: 1, caps: [false, true], xf: place });
    };
    apron('apronF', 2 * XI, xf({ pos: [0, 0, D - 0.018] }));
    for (const s of [-1, 1]) apron(`apron${s > 0 ? 'R' : 'L'}`, D - 2 * P, xf({ pos: [s * (W / 2 - 0.018), 0, D / 2], rot: [0, s * Math.PI / 2, 0] }));

    // —— 格子里的摆件 ——
    {
      const c = C.A; // 青花将军罐（大），立在座上
      stand(k, 'jarStand', 0.075, xf({ pos: [cx(c) + 0.02, c[2], ZM] }));
      jar(k, 'bigJar', xf({ pos: [cx(c) + 0.02, c[2] + 0.018, ZM], rot: [0, 0.4, 0] }), 1.8);
    }
    {
      const c = C.B; // 紫砂壶坐在壶承上，旁边一只品茗杯
      potRest(k, 'potRest', xf({ pos: [cx(c) - 0.06, c[2], ZM + 0.02] }));
      teapot(k, 'teapot', xf({ pos: [cx(c) - 0.06, c[2] + 0.006, ZM + 0.02], rot: [0, -0.5, 0] }), { segs: q(14, 10, 8) });
      cup(k, 'cup', xf({ pos: [cx(c) + 0.11, c[2], ZM + 0.05] }), { tea: false });
    }
    rock(k, 'rock', xf({ pos: [cx(C.Cc), C.Cc[2], ZM], rot: [0, 0.3, 0] }));
    {
      const c = C.D; // 两饼普洱叠着
      teaCake(k, 'cake0', xf({ pos: [cx(c) - 0.02, c[2], ZM], rot: [0, 0.5, 0] }));
      teaCake(k, 'cake1', xf({ pos: [cx(c) - 0.012, c[2] + 0.026, ZM + 0.006], rot: [0.03, 2.1, 0.02] }));
    }
    {
      const c = C.E; // 一摞线装书，书上一只铜香炉（立在座上）
      books(k, 'books', xf({ pos: [cx(c) - 0.01, c[2], ZM], rot: [0, Math.PI / 2 + 0.06, 0] }), 3);
      stand(k, 'burnerStand', 0.064, xf({ pos: [cx(c) + 0.01, c[2] + 0.039, ZM], rot: [0, 0.1, 0] }));
      burner(k, 'burner', xf({ pos: [cx(c) + 0.01, c[2] + 0.057, ZM], rot: [0, 0.2, 0] }));
    }
    {
      const c = C.F; // 白瓷盖碗、青花茶叶罐
      gaiwan(k, 'gaiwan', xf({ pos: [cx(c) - 0.08, c[2], ZM + 0.03], rot: [0, 0.3, 0] }));
      jar(k, 'caddy', xf({ pos: [cx(c) + 0.1, c[2], ZM - 0.02] }), 0.85);
    }
    {
      const c = C.J; // 两本线装书、茶道筒
      books(k, 'booksJ', xf({ pos: [cx(c) - 0.05, c[2], ZM], rot: [0, Math.PI / 2 - 0.05, 0] }), 2);
      toolHolder(k, 'tools', xf({ pos: [cx(c) + 0.12, c[2], ZM - 0.02], rot: [0, 0.6, 0] }));
    }
    {
      // 右上：一只开片大盘立在盘架上（盘面朝前、往后仰一点）
      const c = C.K, R = 0.14, tilt = 0.22;
      const px = cx(c), pz = ZM - 0.01;
      // 盘架：底座、前面一道挡边、后面一根斜撑顶住盘子的圈足
      k.box({ name: 'plateBase', mat: 'rosewood', size: [0.15, 0.014, 0.1], r: q(0.003, 0), segs: q(1, 0), omit: ['ny'], xf: xf({ pos: [px, c[2] + 0.007, pz + 0.005] }) });
      k.box({ name: 'plateLip', mat: 'rosewood', size: [0.15, 0.012, 0.008], r: q(0.002, 0), segs: q(1, 0), omit: ['ny'], xf: xf({ pos: [px, c[2] + 0.02, pz + 0.052] }) });
      k.box({ name: 'plateProp', mat: 'rosewood', size: [0.024, 0.19, 0.008], r: q(0.002, 0), segs: q(1, 0), xf: xf({ pos: [px, c[2] + 0.107, pz - 0.0205], rot: [0.155, 0, 0] }) });
      plate(k, 'plate', xf({ pos: [px, c[2] + 0.014 + R * Math.cos(tilt) + 0.004, pz + 0.012], rot: [Math.PI / 2 - tilt, 0, 0] }), R);
    }
  },
};

// 圆形小座（红木）：摆件底下垫的一块，边上一道凹线
function stand(k, name, R, place) {
  const q = (...v) => k.q(...v);
  k.lathe({
    name, mat: 'rosewood', segs: q(14, 10, 8),
    profile: profile([[R, 0], [R + 0.004, 0.008, { smooth: true }], [R - 0.001, 0.018, { r: q(0.002, 0), segs: 1 }], [0, 0.018]]),
    xf: place,
  });
}
