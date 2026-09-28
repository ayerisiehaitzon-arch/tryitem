import { shape, rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { pianoUV, pianoSwatch } from '../materials/atlas.js';
import { GLYPHS } from '../materials/gym-textures.js';
import { GRAND, GY, KEYS, BLACK_IN_OCTAVE, HARP, STRINGS, grandOutline, offsetLine, noteXAt } from './outline.js';
import { swatch, harpUV, flatPoly, scoreSpread } from './parts.js';

// 三角钢琴：1.62m 的小三角，黑色钢琴烤漆，琴盖用长撑杆撑开、前琴盖折回来叠在主琴盖上。
//   · 琴壳是一个截面（外侧平直、顶上圆边）沿平面轮廓扫一圈：低音侧的直边 → 尾部圆弧 → S 形的弯边（先外凸再内凹）→
//     高音侧的直边。轮廓、琴弦、铁骨的位置都在 outline.js 里，几何和贴图共用；
//   · 琴肚子里是一块平面，俯视投影到钢琴图集的音板 / 铸铁板 / 琴弦上（金色的铁板、四个开口里的云杉音板、
//     斜着压在中音区上面的缠铜低音弦、三排弦轴、铸出来的字……都画在贴图里）；制音器是一个真的盒子，顶面同样投影过去；
//   · 88 个键：白键每个八度一块（顶面、前脸各铺在图集里同一个八度上，键缝画在贴图里），36 个黑键是真的几何
//     （上窄下宽、前端斜切）；LOD2 去掉黑键，用贴图上画好的；
//   · 键盘后面立着收起来的琴键盖，正中一行金色的“TRYITEM”是细线字体的笔画直接做成的薄片（没有贴花的底色块）；
//   · 谱架斜靠在琴弦前面，上面摊着一本钢琴谱（两页，页面从书脊往外鼓起来）；
//   · 三条方锥腿，底下黄铜套和黄铜脚轮；琴肚子底下是琴托（竖琴形的两根立柱）和三个黄铜踏板。
// 除了乐谱，只有两个材质：钢琴烤漆（琴壳、琴盖、腿、琴托）和钢琴图集（其余）。
// 原点在占地的中心（地面上），琴键朝 +z
const { W, L, zF, t: RT } = GRAND;
const xL = -W / 2, xR = W / 2;
const LID = { angle: 0.56, fold: -0.4 };   // 主琴盖撑开的角度；前琴盖（琴盖前面一条）折叠的位置
const DESK = { tilt: 0.24, y: 0.955, z: -0.215, w: 0.78, h: 0.3, t: 0.016 };
const OCT = 7 * KEYS.w;
const XA0 = (-KEYS.n * KEYS.w) / 2; // 最低的 A0 键左沿

export default {
  id: 'grand_piano',
  name: '三角钢琴',
  nameEn: 'Baby Grand Piano',
  category: 'music',
  aoDensity: 110,
  shadow: { margin: 0.25, maxDist: 1.2, density: 48 },
  view: { el: 28, az: 38, dist: 0.82 },
  build(k) {
    const q = (...v) => k.q(...v);
    const out = (o) => grandOutline({ tail: q(12, 8, 5), bent: q(20, 12, 7), ...o });

    // —— 琴壳：截面沿轮廓扫一圈（前面两端封口），外侧顶上圆边 ——
    {
      const H = GY.rim - GY.bottom;
      const prof = shape([
        [-RT / 2, 0], [RT / 2, 0, { r: q(0.003, 0), segs: 1 }],
        [RT / 2, H, { r: q(0.014, 0.01, 0.006), segs: q(3, 2, 1) }], [-RT / 2, H, { r: q(0.006, 0.004, 0), segs: q(2, 1, 1) }],
      ]);
      const path = offsetLine(out(), RT / 2).map(([x, z]) => [x, GY.bottom, z]);
      k.sweep({ name: 'rim', mat: 'lacquer', shape: prof, caps: [true, true], up: [0, 1, 0], path, density: { side: 0.8 } });
    }
    // 琴底板（朝下，连着键盘底下那一块）
    flatPoly(k, { name: 'bottom', mat: 'lacquer', pts: out({ z0: 0.024 }), y: GY.bottom + 0.0005, up: false, density: 0.15 });
    // 琴肚子里的平面：投影到音板 / 铁骨 / 琴弦的贴图
    flatPoly(k, { name: 'harp', mat: 'piano', pts: offsetLine(out({ z0: HARP.z0 }), RT), y: GY.deck, uv: harpUV, density: 0.8 });

    // —— 制音器：一个盒子，左端顺着低音弦斜切；顶面投影到贴图上画好的一排制音器头 ——
    {
      const [zA, zB] = STRINGS.damper, zc = (zA + zB) / 2;
      const xr = noteXAt(STRINGS.dampers, zc) + 0.0075;
      const pts = [[noteXAt(1, zA) - 0.006, zA], [xr, zA], [xr, zB], [noteXAt(1, zB) - 0.006, zB]];
      const part = k.extrude({
        name: 'dampers', mat: 'piano', shape: shape(pts.map(([x, z]) => [x, -z])), depth: 0.034, axis: 'y',
        caps: [false, true], bevel: [0, q(0.0015, 0)], bsegs: 1, density: { side: 0.5 }, xf: xf({ pos: [0, GY.deck, 0] }),
      });
      const dark = pianoSwatch('damper');
      part.T = part.P.map((p, i) => (part.N[i][1] > 0.7 ? harpUV(p[0], p[2]) : dark));
    }
    // 谱架下面的两根滑轨
    for (const s of [-1, 1]) {
      k.box({ name: `rail${s > 0 ? 'R' : 'L'}`, mat: 'lacquer', size: [0.02, 0.03, 0.02], r: q(0.003, 0), segs: q(1, 0), omit: ['ny'], xf: xf({ pos: [s * 0.3, GY.deck + 0.015, -0.229] }) });
    }

    // —— 键盘 ——
    // 键盘前面的键口条、两端的侧挡
    k.box({ name: 'keySlip', mat: 'lacquer', size: [KEYS.n * KEYS.w, 0.045, 0.018], r: q(0.003, 0.002, 0), segs: q(2, 1, 0), omit: ['ny', 'nz'], xf: xf({ pos: [0, 0.6775, -0.003] }) });
    {
      const cheek = shape([
        [-zF, GY.bottom], [-zF, GY.cheek], [-0.024, GY.cheek, { r: q(0.04, 0.03, 0.02), segs: q(4, 2, 1) }], [-0.024, GY.bottom, { r: q(0.004, 0), segs: 1 }],
      ]);
      const cw = W / 2 + XA0;
      for (const [s, x0] of [[-1, xL], [1, -XA0]]) {
        k.extrude({
          name: `cheek${s > 0 ? 'R' : 'L'}`, mat: 'lacquer', shape: cheek, depth: cw, axis: 'x',
          bevel: q(0.004, 0.003, 0), bsegs: q(2, 1, 1), xf: xf({ pos: [x0, 0, 0] }),
        });
      }
    }
    // 白键：每个八度一块，顶面、前脸铺在图集里同一个八度上（最低的 A0、B0 和最高的 C8 各占八度的一段）
    const octaves = [{ x0: XA0, n: 2, start: XA0 - 5 * KEYS.w }];
    for (let o = 0; o < 7; o++) octaves.push({ x0: XA0 + (2 + 7 * o) * KEYS.w, n: 7, start: XA0 + (2 + 7 * o) * KEYS.w });
    octaves.push({ x0: XA0 + 51 * KEYS.w, n: 1, start: XA0 + 51 * KEYS.w });
    octaves.forEach((o, i) => {
      const w = o.n * KEYS.w, len = KEYS.front - KEYS.back, hgt = GY.keyTop - GY.keyBot;
      const part = k.box({
        name: `white${i}`, mat: 'piano', size: [w, hgt, len], segs: 0, grain: 'x', omit: ['ny', 'nz', 'px', 'nx'],
        xf: xf({ pos: [o.x0 + w / 2, (GY.keyTop + GY.keyBot) / 2, (KEYS.front + KEYS.back) / 2] }),
      });
      part.T = part.P.map((p, j) => {
        const u = (p[0] - o.start) / OCT;
        return part.N[j][1] > 0.7 ? pianoUV('octave', u, (KEYS.front - p[2]) / len) : pianoUV('keyfront', u, (GY.keyTop - p[1]) / hgt);
      });
    });
    // 黑键：梯形截面（上窄下宽、顶上两条长棱倒圆）沿琴键挤出，前端的顶往后收 5mm（斜切）；LOD2 用贴图上画的
    if (k.lod < 2) {
      const blacks = [octaves[0].start + BLACK_IN_OCTAVE[4]];
      for (let o = 1; o <= 7; o++) for (const c of BLACK_IN_OCTAVE) blacks.push(octaves[o].start + c);
      const z1 = KEYS.back + KEYS.blackLen, z0 = KEYS.back - 0.012, bw = KEYS.blackW / 2, tw = KEYS.blackTop / 2, bh = KEYS.blackH;
      const sec = shape([[-bw, 0], [bw, 0], [tw, bh, { r: q(0.0016, 0), segs: 1 }], [-tw, bh, { r: q(0.0016, 0), segs: 1 }]]);
      blacks.forEach((xc, i) => {
        const part = k.extrude({ name: `black${i}`, mat: 'piano', shape: sec, depth: z1 - z0, axis: 'z', caps: [false, true] });
        part.deform((p) => [p[0], p[1], p[2] - 0.005 * (p[1] / bh) * (p[2] / (z1 - z0))]);
        part.transform(xf({ pos: [xc, GY.keyTop, z0] }));
        swatch(part, 'ebony');
      });
    }
    // 键盘后面：收起来的琴键盖（立着），它后面一块挡板一直接到琴肚子的平面；琴键盖底下一条酒红色的呢
    k.box({ name: 'frontBoard', mat: 'lacquer', size: [W - 2 * RT, GY.deck - 0.7, 0.018], segs: 0, omit: ['nz', 'ny'], xf: xf({ pos: [0, (GY.deck + 0.7) / 2, HARP.z0 + 0.009] }) });
    k.box({
      name: 'fallboard', mat: 'lacquer', size: [KEYS.n * KEYS.w, GY.fall - 0.7, 0.022], r: q(0.005, 0.004, 0), segs: q(2, 1, 0), omit: ['nz', 'ny'],
      xf: xf({ pos: [0, (GY.fall + 0.7) / 2, KEYS.back - 0.011] }),
    });
    if (k.lod < 2) {
      swatch(k.box({ name: 'keyFelt', mat: 'piano', size: [KEYS.n * KEYS.w, 0.005, 0.003], segs: 0, omit: ['ny', 'nz'], xf: xf({ pos: [0, GY.keyTop + 0.0035, KEYS.back + 0.0015] }) }), 'felt');
      // 金字铭牌：细线字体的每一笔做成一条薄片，贴在琴键盖正面
      const part = k.part('piano', 'logo');
      const h = 0.0135, sw = 0.0016, track = 0.26, str = 'TRYITEM';
      const width = [...str].reduce((s, ch) => s + (GLYPHS[ch].w + track) * h, -track * h);
      const ch = k.chart('logo:f', width, h, { density: 0.3 });
      const zf = KEYS.back + 0.0004, yTop = 0.795 + h / 2;
      let cx = -width / 2;
      for (const c of str) {
        for (const line of GLYPHS[c].s) for (let i = 0; i + 1 < line.length; i++) {
          const a = [cx + line[i][0] * h, yTop - line[i][1] * h], b = [cx + line[i + 1][0] * h, yTop - line[i + 1][1] * h];
          const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1;
          const e = [(d[0] / l) * sw * 0.5, (d[1] / l) * sw * 0.5], n = [-e[1], e[0]];
          const P = [[a[0] - e[0] + n[0], a[1] - e[1] + n[1]], [b[0] + e[0] + n[0], b[1] + e[1] + n[1]], [b[0] + e[0] - n[0], b[1] + e[1] - n[1]], [a[0] - e[0] - n[0], a[1] - e[1] - n[1]]];
          const ids = P.map(([x, y]) => part.v([x, y, zf], [0, 0, 1], [0, 0], ch, [(x + width / 2) / width, (yTop - y) / h]));
          part.quad(...ids);
        }
        cx += (GLYPHS[c].w + track) * h;
      }
      swatch(part, 'brass');
    }

    // —— 谱架：斜靠的一块板，底下一条托谱的横档（前沿一道小挡边），上面摊着一本钢琴谱 ——
    const D = xf({ pos: [0, DESK.y, DESK.z], rot: [-DESK.tilt, 0, 0] });
    k.box({
      name: 'desk', mat: 'lacquer', size: [DESK.w, DESK.h, DESK.t], r: q(0.004, 0.003, 0), segs: q(2, 1, 0),
      xf: D.mul(xf({ pos: [0, DESK.h / 2, -DESK.t / 2] })),
    });
    k.box({ name: 'ledge', mat: 'lacquer', size: [DESK.w, 0.012, 0.036], r: q(0.003, 0), segs: q(1, 0), xf: D.mul(xf({ pos: [0, 0.006, 0.018] })) });
    k.box({ name: 'lip', mat: 'lacquer', size: [DESK.w, 0.018, 0.006], r: q(0.002, 0), segs: q(1, 0), omit: ['ny'], xf: D.mul(xf({ pos: [0, 0.021, 0.033] })) });
    scoreSpread(k, { name: 'music', place: D.mul(xf({ pos: [0, 0.0125, 0.001] })), pages: [0, 1], bow: 0.011, segs: q(8, 4, 2) });

    // —— 琴盖：主琴盖绕低音侧的铰链转开，前琴盖折回来叠在主琴盖上；一根长撑杆撑着 ——
    const Lx = xf({ pos: [xL, GY.rim, 0], rot: [0, 0, LID.angle] }).mul(xf({ pos: [-xL, -GY.rim, 0] }));
    {
      let pts = out({ z0: LID.fold });
      if (Math.hypot(pts.at(-1)[0] - pts.at(-2)[0], pts.at(-1)[1] - pts.at(-2)[1]) < 1e-6) pts = pts.slice(0, -1);
      const lid = shape(pts.reverse().map(([x, z], i, a) => [x, -z, i === 0 || i === a.length - 1 ? { r: 0.004, segs: 1 } : { smooth: true }]));
      k.extrude({
        name: 'lid', mat: 'lacquer', shape: lid, depth: GY.lid, axis: 'y',
        bevel: [q(0.002, 0), { w: q(0.006, 0.004, 0.002), h: q(0.006, 0.004, 0.002) }], bsegs: q(2, 1, 1), density: { side: 0.4, cap0: 0.6, cap1: 0.35 },
        xf: Lx.mul(xf({ pos: [0, GY.rim, 0] })),
      });
      // 前琴盖：翻过来叠在主琴盖上（原来朝上的一面现在贴着主琴盖）
      const fd = LID.fold - zF;
      k.box({
        name: 'fold', mat: 'lacquer', size: [W, GY.lid, -fd], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), omit: ['ny'], density: { py: 0.35 },
        xf: Lx.mul(xf({ pos: [0, GY.rim + 1.5 * GY.lid + 0.0005, LID.fold + fd / 2] })),
      });
      if (k.lod < 2) {
        // 前后琴盖之间的长铰链、低音侧的三个铰链
        swatch(k.sweep({
          name: 'foldHinge', mat: 'piano', shape: circle(0.0028, q(8, 6)), caps: [true, true], up: [0, 1, 0],
          path: [[xL + 0.02, GY.rim + GY.lid + 0.001, LID.fold], [xR - 0.02, GY.rim + GY.lid + 0.001, LID.fold]].map((p) => Lx.apply(p)),
        }), 'brass');
        [-0.62, -0.96, -1.22].forEach((z, i) => {
          swatch(k.sweep({
            name: `hinge${i}`, mat: 'piano', shape: circle(0.0048, q(10, 6)), caps: [true, true], up: [0, 1, 0],
            path: [[xL - 0.003, GY.rim + 0.002, z + 0.028], [xL - 0.003, GY.rim + 0.002, z - 0.028]],
          }), 'brass');
        });
      }
      // 撑杆：从弯边的琴壳顶上斜着撑到琴盖底面（两头黄铜的杯座）
      const zs = -0.92;
      const rimC = offsetLine(out(), RT / 2).filter((p) => p[0] > 0.2);
      let base = rimC[0];
      for (const p of rimC) if (Math.abs(p[1] - zs) < Math.abs(base[1] - zs)) base = p;
      const bottom = [base[0], GY.rim + 0.004, base[1]];
      const top = Lx.apply([base[0] - 0.07, GY.rim, base[1]]);
      k.sweep({ name: 'prop', mat: 'lacquer', shape: circle(0.011, q(10, 8, 6)), caps: [false, false], up: [1, 0, 0], path: [bottom, top] });
      if (k.lod < 2) {
        const dir = [top[0] - bottom[0], top[1] - bottom[1], top[2] - bottom[2]], dl = Math.hypot(...dir);
        const u = dir.map((v) => v / dl);
        for (const [name, c, s] of [['propCupB', bottom, 1], ['propCupT', top, -1]]) {
          swatch(k.sweep({
            name, mat: 'piano', shape: circle(0.0145, q(10, 6)), caps: [s < 0, s > 0], up: [1, 0, 0],
            path: [c.map((v, j) => v - s * u[j] * 0.002), c.map((v, j) => v + s * u[j] * 0.026)],
          }), 'brass');
        }
      }
    }

    // —— 三条腿：方锥腿（上粗下细）、顶上一块腿座，底下黄铜套和黄铜脚轮 ——
    [[-0.676, -0.075, 0.3], [0.676, -0.075, -0.4], [-0.33, -1.3, 1.1]].forEach(([x, z, yaw], i) => {
      k.box({ name: `legBlock${i}`, mat: 'lacquer', size: [0.12, 0.05, 0.12], r: q(0.006, 0.005, 0), segs: q(1, 1, 0), omit: ['py'], xf: xf({ pos: [x, GY.bottom - 0.025, z] }) });
      k.extrude({
        name: `leg${i}`, mat: 'lacquer', shape: rect(0.064, 0.064, { r: q(0.01, 0.008, 0.006), segs: q(2, 1, 1) }), depth: GY.bottom - 0.05 - 0.088, taper: 1.36,
        axis: 'y', caps: [false, false], xf: xf({ pos: [x, 0.088, z] }),
      });
      swatch(k.extrude({
        name: `ferrule${i}`, mat: 'piano', shape: rect(0.068, 0.068, { r: q(0.011, 0.009, 0.007), segs: q(2, 1, 1) }), depth: 0.03, taper: 1.02,
        axis: 'y', caps: [true, false], bevel: [q(0.002, 0), 0], xf: xf({ pos: [x, 0.062, z] }),
      }), 'brass');
      // 脚轮：一个黄铜轮子夹在叉子里
      const C = xf({ pos: [x, 0, z], rot: [0, yaw, 0] });
      swatch(k.lathe({
        name: `wheel${i}`, mat: 'piano', segs: q(12, 8, 6),
        profile: profile([[0.004, -0.01], [0.025, -0.01, { smooth: true }], [0.03, 0, { smooth: true }], [0.025, 0.01, { smooth: true }], [0.004, 0.01]]),
        xf: C.mul(xf({ pos: [0, 0.03, 0.012], rot: [0, 0, Math.PI / 2] })),
      }), 'brass');
      if (k.lod < 2) {
        for (const s of [-1, 1]) {
          swatch(k.box({ name: `fork${i}${s > 0 ? 'R' : 'L'}`, mat: 'piano', size: [0.004, 0.036, 0.026], segs: 0, omit: ['ny'], xf: C.mul(xf({ pos: [s * 0.0135, 0.046, 0.008] })) }), 'brass');
        }
      }
    });

    // —— 琴托和踏板：竖琴形的两根立柱，底下踏板盒，三个黄铜踏板；两根斜撑拉到琴底 ——
    {
      const zc = -0.33;
      k.box({ name: 'pedalBox', mat: 'lacquer', size: [0.3, 0.1, 0.11], r: q(0.012, 0.008, 0.004), segs: q(2, 1, 1), xf: xf({ pos: [0, 0.085, zc] }) });
      k.box({ name: 'lyreTop', mat: 'lacquer', size: [0.28, 0.035, 0.09], r: q(0.006, 0), segs: q(1, 0), omit: ['py'], xf: xf({ pos: [0, GY.bottom - 0.0175, zc] }) });
      const n = q(8, 5, 3);
      for (const s of [-1, 1]) {
        const P = [[0.07, 0.13], [0.15, 0.3], [0.145, 0.5], [0.095, GY.bottom - 0.03]];
        const path = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, u = 1 - t;
          const bx = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
          const by = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
          path.push([s * bx, by, zc]);
        }
        k.sweep({ name: `lyre${s > 0 ? 'R' : 'L'}`, mat: 'lacquer', shape: rect(0.03, 0.04, { r: q(0.008, 0.006, 0), segs: 1 }), caps: [false, false], up: [0, 0, 1], path });
        k.sweep({
          name: `brace${s > 0 ? 'R' : 'L'}`, mat: 'lacquer', shape: circle(0.01, q(8, 6, 4)), caps: [false, false], up: [1, 0, 0],
          path: [[s * 0.1, 0.11, zc - 0.05], [s * 0.15, GY.bottom - 0.005, zc - 0.42]],
        });
      }
      // 踏板：俯视轮廓挤出一片黄铜，尖端微微翘起
      const pedal = shape([[-0.016, -0.078, { r: q(0.014, 0.01, 0), segs: q(2, 1, 1) }], [0, -0.104, { smooth: true }], [0.016, -0.078, { r: q(0.014, 0.01, 0), segs: q(2, 1, 1) }], [0.012, 0], [-0.012, 0]]);
      for (const [i, px] of [[0, -0.07], [1, 0], [2, 0.07]]) {
        swatch(k.extrude({
          name: `pedal${i}`, mat: 'piano', shape: pedal, depth: 0.011, axis: 'y', bevel: q(0.003, 0.002, 0), bsegs: 1,
          xf: xf({ pos: [px, 0.078, zc + 0.05], rot: [-0.12, 0, 0] }),
        }), 'brass');
      }
    }

    // 占地中心放到原点
    const shift = xf({ pos: [0, 0, L / 2] });
    for (const p of k.parts) p.transform(shift);
  },
};
