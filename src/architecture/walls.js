import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';

// 墙模块：长 2m、高 2.6m、厚 12cm。原点在模块底边中点（x ∈ [-1, 1]，墙面在 z = ±0.06），
// 按 2m 网格首尾相接就是一整面墙：
//   · 两端是直角（不倒角）：接缝处没有 V 形槽；踢脚线、腰线也一直通到端头，和下一块接上；
//   · 乳胶漆贴图用模块坐标（米）对齐、周期 0.5m 整除 2m，拼起来看不出接缝；
//   · 墙底和踢脚线下沿的 AO 按“站在地面上”烘焙；地面上沿墙根的一道软阴影是烘焙贴花。
export const WALL = { L: 2, H: 2.6, T: 0.12 };

// 一块抹灰墙体（盒子）。grain 'x' + uvShift：墙面的 u = 模块里的 x、v = 离地高度，跨模块连续。
// splitY：在这些高度上给墙面加一圈顶点 —— 门洞 / 窗洞旁边的墙垛和洞口上下的墙块共用这条棱，
// 顶点一一对上（没有 T 型接缝），否则光栅化会在接缝上漏出细缝，看见墙体内部被 AO 压黑的面
//
// ends：落在模块边界（x = ±1）上的一端。两块模块并排时，共用的那条棱在 GPU 上是用两个不同的矩阵
// 各自变换的，浮点误差会让接缝上漏出断断续续的亚像素裂缝，所以墙面在模块边界处多伸出 1mm（OVERLAP），
// 相邻模块重叠 2mm 盖住它 —— 重叠的两层是同一张按模块坐标对齐的贴图、同样的 AO，看不出来。
// 这一端本身不生成端面，由 wallEnds() 统一封口。
export const OVERLAP = 0.001;
export function wallBox(k, { name, mat = 'plaster', x0: a0, x1: a1, y0 = 0, y1 = WALL.H, z0 = -WALL.T / 2, z1 = WALL.T / 2, omit = ['ny'], density, splitY = [], ends = [] }) {
  const x0 = ends.includes('nx') ? a0 - OVERLAP : a0, x1 = ends.includes('px') ? a1 + OVERLAP : a1;
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const hy = (y1 - y0) / 2;
  const ys = [-1, ...splitY.map((y) => (y - c[1]) / hy).filter((t) => t > -1 && t < 1).sort((a, b) => a - b), 1];
  const b = k.box({
    name, mat, size: [x1 - x0, y1 - y0, z1 - z0], segs: 0, omit: [...omit, ...ends], grain: 'x', density, div: [1, ys, 1],
    xf: xf({ pos: c }),
  });
  b.uvShift = [c[0], c[1]];
  return b;
}

// 模块两端的封口面：四边都比墙面缩进 2mm。
// 端面如果和墙面贴在同一条棱上，模块并排时这条棱落在隔壁模块的墙面背后，远看两者深度几乎一样，
// 会断断续续地“透”出来（一条虚线）；缩进 2mm 就永远在墙面之后。墙的尽头单独露出来时，四周那道 2mm 的缝看不见。
const INSET = 0.002;
export function wallEnds(k, { mat = 'plaster' } = {}) {
  const { L, H, T } = WALL;
  for (const s of [-1, 1]) {
    const e = s > 0 ? 'px' : 'nx';
    const cap = k.box({
      name: `end${s > 0 ? 'R' : 'L'}`, mat, size: [0.0002, H - INSET, T - 2 * INSET], segs: 0,
      omit: ['px', 'nx', 'py', 'ny', 'pz', 'nz'].filter((f) => f !== e), grain: 'x', density: { [e]: 0.5 },
      xf: xf({ pos: [s * (L / 2 - INSET), (H - INSET) / 2, 0] }),
    });
    cap.uvShift = [(H - INSET) / 2, 0];
  }
}
// 沿墙长的线条（踢脚线、腰线）两头各缩 0.5mm：和隔壁模块的线条之间留一道发丝缝（真实的线条接头也是这样），
// 封口面就不会和隔壁线条的正面抢深度
const TRIM_GAP = 0.0005;

// 踢脚线截面（沿墙长挤出）：截面 X 取负是离开墙面的方向，Y 向上；上沿一道小圆角 + 斜面
function skirtingShape(k, h, t) {
  const q = (...v) => k.q(...v);
  return shape([
    [0, 0], [0, h],
    [-t * 0.55, h, { r: q(0.004, 0.003, 0), segs: q(2, 1, 1) }],
    [-t, h - t * 0.55, { r: q(0.003, 0, 0), segs: 1 }],
    [-t, 0],
  ]);
}

// 一段踢脚线：x0 → x1，贴在 z = zFace 的墙面上，side = +1 朝 +z、-1 朝 -z
export function skirting(k, { name, mat = 'paint', x0, x1, zFace, side = 1, h = 0.09, t = 0.014, caps = [true, true] }) {
  const a = x0 + TRIM_GAP, b = x1 - TRIM_GAP;
  return k.extrude({
    name, mat, shape: skirtingShape(k, h, t), depth: b - a, axis: 'x', caps,
    density: { cap0: 0.2, cap1: 0.2 },
    xf: side > 0 ? xf({ pos: [a, 0, zFace] }) : xf({ pos: [b, 0, zFace], rot: [0, Math.PI, 0] }),
  });
}

// —— 白墙：墙体 + 两面踢脚线 ——
export const wall = {
  id: 'wall',
  name: '白墙',
  nameEn: 'Plaster Wall',
  category: 'architecture',
  aoDensity: 80,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 16, az: 30 },
  build(k) {
    const { L, T } = WALL;
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingF', x0: -L / 2, x1: L / 2, zFace: T / 2, side: 1 });
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
  },
};

// —— 护墙板墙：正面鼠尾草绿的法式护墙板（上下两排线条框 + 腰线 + 高踢脚），背面白墙 ——
// 每个模块两列框，框距模块端头 8cm、两框之间 16cm：模块拼起来框的间距处处一样。
const PANELS = { margin: 0.08, gap: 0.16, low: [0.2, 0.8], high: [1.02, 2.38], rail: 0.87 };

// 线条框截面（开放轮廓，从框内缘走到外缘；x 朝框内为正，y 离开墙面）：内侧一道反曲线，外侧一个圆鼓
function panelProfile(k) {
  const s = { smooth: true };
  return profile(k.q(
    [[0.011, 0], [0.011, 0.002], [0.008, 0.0042, s], [0.0045, 0.0085, s], [0.0015, 0.0115, s],
      [-0.002, 0.012, s], [-0.0065, 0.0105, s], [-0.009, 0.0065, s], [-0.011, 0.003], [-0.011, 0]],
    [[0.011, 0], [0.011, 0.002], [0.0045, 0.0085, s], [-0.002, 0.012, s], [-0.009, 0.0065, s], [-0.011, 0]],
    [[0.011, 0], [0.004, 0.011], [-0.005, 0.011], [-0.011, 0]],
  ));
}
// 腰线截面（沿墙长挤出，和踢脚线同一坐标约定）：下面一道小台阶，中间一个大圆鼻，上沿收一道斜面
function railShape(k) {
  const q = (...v) => k.q(...v);
  return shape([
    [0, 0], [0, 0.056],
    [-0.009, 0.056, { r: q(0.003, 0.002, 0), segs: 1 }],
    [-0.024, 0.036, { r: q(0.011, 0.009, 0), segs: q(3, 2, 1) }],
    [-0.024, 0.02, { r: q(0.006, 0.004, 0), segs: q(2, 1, 1) }],
    [-0.013, 0.01],
    [-0.013, 0, { r: q(0.002, 0, 0), segs: 1 }],
  ]);
}

export const wallWainscot = {
  id: 'wall_wainscot',
  name: '护墙板墙',
  nameEn: 'Wainscot Panel Wall',
  category: 'architecture',
  aoDensity: 110,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 14, az: 26 },
  build(k) {
    const { L, H, T } = WALL;
    const skin = 0.004; // 正面一层“护墙板底板”，和背面白墙分开上色
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, z1: T / 2 - skin, omit: ['ny', 'pz'], ends: ['nx', 'px'] });
    wallBox(k, { name: 'panelSkin', mat: 'plaster_sage', x0: -L / 2, x1: L / 2, z0: T / 2 - skin, omit: ['ny', 'nz'], ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingF', mat: 'paint_sage', x0: -L / 2, x1: L / 2, zFace: T / 2, side: 1, h: 0.12, t: 0.016 });
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
    k.extrude({
      name: 'rail', mat: 'paint_sage', shape: railShape(k), depth: L - 2 * TRIM_GAP, axis: 'x', density: { cap0: 0.2, cap1: 0.2 },
      xf: xf({ pos: [-L / 2 + TRIM_GAP, PANELS.rail, T / 2] }),
    });
    // 线条框：沿框的中心线扫掠一圈（闭合路径，拐角斜接）
    const prof = panelProfile(k);
    const pw = (L - 2 * PANELS.margin - PANELS.gap) / 2, w = 0.011;
    for (const [row, [y0, y1]] of [['L', PANELS.low], ['H', PANELS.high]]) {
      for (let c = 0; c < 2; c++) {
        const x0 = -L / 2 + PANELS.margin + c * (pw + PANELS.gap);
        const z = T / 2;
        k.sweep({
          name: `frame${row}${c}`, mat: 'paint_sage', shape: prof, closed: true, caps: [false, false], up: [0, 0, 1],
          path: [[x0 + w, y0 + w, z], [x0 + pw - w, y0 + w, z], [x0 + pw - w, y1 - w, z], [x0 + w, y1 - w, z]],
        });
      }
    }
  },
};

// —— 木条吸音墙：正面是一根根竖着的胡桃木条，条与条之间露出黑色的吸音毡；背面白墙 ——
// 木条 2.7cm 宽、2cm 厚，中心距 4cm；第一根离模块端头 2cm：模块拼起来，跨过接缝的间距也是 4cm。
// 木条底下离地 1cm 留一道影缝，顶到墙顶。每根木条的木纹偏移各不相同（按部件名随机），不会一排一样。
export const SLATS = { pitch: 0.04, w: 0.027, t: 0.02, gap: 0.01 };
export const wallSlat = {
  id: 'wall_slat',
  name: '木条吸音墙',
  nameEn: 'Acoustic Slat Wall',
  category: 'architecture',
  aoDensity: 110,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 12, az: 28 },
  build(k) {
    const { L, H, T } = WALL;
    const skin = 0.004;
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, z1: T / 2 - skin, omit: ['ny', 'pz'], ends: ['nx', 'px'] });
    wallBox(k, { name: 'felt', mat: 'felt_black', x0: -L / 2, x1: L / 2, z0: T / 2 - skin, omit: ['ny', 'nz'], ends: ['nx', 'px'], density: { pz: 0.6 } });
    wallEnds(k);
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
    const { pitch, w, t, gap } = SLATS, n = Math.round(L / pitch);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + pitch / 2 + i * pitch;
      k.box({
        name: `slat${i}`, mat: 'walnut', size: [w, H - gap, t], segs: 0, grain: 'y', omit: ['nz'],
        density: { px: 0.3, nx: 0.3, ny: 0.2 }, xf: xf({ pos: [x, gap + (H - gap) / 2, T / 2 + t / 2] }),
      });
    }
  },
};

// —— 镜面墙（健身房）：正面一整块银镜，下沿坐在一道铝托条上、上沿一道铝收边，镜子下面是普通的踢脚线；背面白墙 ——
// 镜子左右各缩 1mm：模块拼起来，镜子和镜子之间留一道 2mm 的缝（真实的镜面墙也是一块块拼起来的）。
export const MIRROR = { y0: 0.11, y1: 2.3, t: 0.006 };
export const wallMirror = {
  id: 'wall_mirror',
  name: '镜面墙',
  nameEn: 'Gym Mirror Wall',
  category: 'architecture',
  aoDensity: 80,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 12, az: 28 },
  build(k) {
    const { L, T } = WALL;
    const { y0, y1, t } = MIRROR;
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingF', x0: -L / 2, x1: L / 2, zFace: T / 2, side: 1 });
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
    k.box({ name: 'mirror', mat: 'mirror', size: [L - 0.002, y1 - y0, t], segs: 0, omit: ['nz'], density: { pz: 0.5 }, xf: xf({ pos: [0, (y0 + y1) / 2, T / 2 + t / 2] }) });
    // 铝托条（镜子下沿）和铝收边（上沿），两头和线条一样缩 0.5mm
    const d = t + 0.006;
    k.box({ name: 'ledge', mat: 'aluminum', size: [L - 2 * TRIM_GAP, 0.012, d], r: k.q(0.002, 0), segs: k.q(1, 0), omit: ['nz'], xf: xf({ pos: [0, y0 - 0.006, T / 2 + d / 2] }) });
    k.box({ name: 'cap', mat: 'aluminum', size: [L - 2 * TRIM_GAP, 0.016, d], r: k.q(0.002, 0), segs: k.q(1, 0), omit: ['nz'], xf: xf({ pos: [0, y1 + 0.008, T / 2 + d / 2] }) });
  },
};

// —— 吸音棉墙（排练室）：正面从 25cm 到 2.25m 贴满楔形吸音棉，33.3cm 一块（6 × 6 块），每块五道楔形的棱，
//    相邻两块的棱一竖一横（棋盘格交错）；块与块之间留 4mm 的缝；下面露出白墙和踢脚线，背面白墙 ——
// 一块 2m 的模块正好六列，模块拼起来棱的方向接着交错下去。
export const FOAM = { y0: 0.25, n: 6, ridges: 5, h: 0.034, base: 0.012, gap: 0.004 };
export const wallFoam = {
  id: 'wall_foam',
  name: '吸音棉墙',
  nameEn: 'Acoustic Foam Wall',
  category: 'architecture',
  aoDensity: 90,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 12, az: 28 },
  build(k) {
    const { L, T } = WALL;
    const { y0, n, ridges, h, base, gap } = FOAM;
    const tile = L / n, zf = T / 2;
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingF', x0: -L / 2, x1: L / 2, zFace: zf, side: 1 });
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
    // 整片吸音棉底下一层薄的黑底：块与块之间的缝里看到的是黑色，不是白墙
    k.box({ name: 'foamBack', mat: 'foam', size: [L - 0.001, n * tile, 0.002], segs: 0, omit: ['nz'], density: { pz: 0.2 }, xf: xf({ pos: [0, y0 + (n * tile) / 2, zf + 0.001] }) });
    const w = (tile - gap) / ridges;
    const vShape = shape([[-w / 2, 0], [0, -h], [w / 2, 0]]);    // 竖棱：截面在 xz 平面（axis 'y'：截面 y → -z）；两个截面都是逆时针
    const hShape = shape([[0, -w / 2], [0, w / 2], [-h, 0]]);    // 横棱：截面在 zy 平面（axis 'x'：截面 x → -z）
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cx = -L / 2 + tile * (c + 0.5), cy = y0 + tile * (r + 0.5), s = tile - gap;
      k.box({ name: `foamBase${r}_${c}`, mat: 'foam', size: [s, s, base - 0.002], segs: 0, omit: ['nz'], density: { pz: 0.3 }, xf: xf({ pos: [cx, cy, zf + 0.002 + (base - 0.002) / 2] }) });
      if (k.lod === 2) continue;
      const vertical = (r + c) % 2 === 0;
      for (let i = 0; i < ridges; i++) {
        const o = -s / 2 + w * (i + 0.5);
        if (vertical) {
          k.extrude({ name: `foam${r}_${c}_${i}`, mat: 'foam', shape: vShape, depth: s, axis: 'y', density: { cap0: 0.3, cap1: 0.3 }, xf: xf({ pos: [cx + o, cy - s / 2, zf + base] }) });
        } else {
          k.extrude({ name: `foam${r}_${c}_${i}`, mat: 'foam', shape: hShape, depth: s, axis: 'x', density: { cap0: 0.3, cap1: 0.3 }, xf: xf({ pos: [cx - s / 2, cy + o, zf + base] }) });
        }
      }
    }
  },
};

// —— 墙纸墙：正面一层碎花墙纸（1mm 的皮，和护墙板墙的做法一样），白色踢脚线，背面白墙 ——
// 墙纸的周期 0.5m 整除 2m，按模块坐标贴：模块拼起来图案接得上
export const wallPaper = {
  id: 'wall_paper',
  name: '墙纸墙',
  nameEn: 'Floral Wallpaper Wall',
  category: 'architecture',
  aoDensity: 80,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 16, az: 30 },
  build(k) {
    const { L, T } = WALL;
    const skin = 0.001;
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, z1: T / 2 - skin, omit: ['ny', 'pz'], ends: ['nx', 'px'] });
    wallBox(k, { name: 'paper', mat: 'wallpaper', x0: -L / 2, x1: L / 2, z0: T / 2 - skin, omit: ['ny', 'nz'], ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingF', x0: -L / 2, x1: L / 2, zFace: T / 2, side: 1 });
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
  },
};

// 红砖墙：和墙纸墙一样的做法 —— 抹灰墙体的正面换成一层 1mm 的“皮”，贴红砖（按模块坐标，周期 1 × 0.6m 整除 2m，
// 最下面一层是整砖、从地面起砌），裸砖墙不做正面的踢脚线；背面还是白墙和踢脚线
export const wallBrick = {
  id: 'wall_brick',
  name: '红砖墙',
  nameEn: 'Exposed Red Brick Wall',
  category: 'architecture',
  aoDensity: 80,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 16, az: 30 },
  build(k) {
    const { L, T } = WALL;
    const skin = 0.001;
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, z1: T / 2 - skin, omit: ['ny', 'pz'], ends: ['nx', 'px'] });
    wallBox(k, { name: 'brick', mat: 'brick', x0: -L / 2, x1: L / 2, z0: T / 2 - skin, omit: ['ny', 'nz'], ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
  },
};

// 瓦楞钢板墙：白墙前面钉一层镀锌瓦楞钢板 —— 真的起伏（每块模块 26 道波，周期 7.7cm 整除 2m，波谷贴着墙面、波峰凸出 1.8cm），
// 贴图按模块坐标贴锌花；顶上一条镀锌的收边条盖住钢板的上沿，不做踢脚线；背面还是白墙和踢脚线
export const wallCorrugated = {
  id: 'wall_corrugated',
  name: '瓦楞钢板墙',
  nameEn: 'Corrugated Galvanized Steel Wall',
  category: 'architecture',
  aoDensity: 80,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 16, az: 30 },
  build(k) {
    const { L, H, T } = WALL;
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, omit: ['ny', 'pz'], ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
    // 波形：d(x) = 深 / 2 · (1 - cos)，一个周期 m 段；两头各多伸出 OVERLAP（和隔壁模块重叠）
    const N = 26, P = L / N, depth = 0.018, m = k.q(8, 6, 4), n = N * m;
    const pts = Array.from({ length: n + 1 }, (_, i) => {
      const x = -L / 2 + (L * i) / n, d = (depth / 2) * (1 - Math.cos((2 * Math.PI * (x + L / 2)) / P));
      return [x * (1 + (2 * OVERLAP) / L), -(T / 2 + d), { smooth: true }];
    });
    const sheet = k.extrude({ name: 'sheet', mat: 'galvanized', shape: shape(pts, { closed: false }), depth: H, axis: 'y', caps: [false, false], density: { side: 0.5 } });
    sheet.T = sheet.P.map((p) => [p[0], p[1]]);
    k.box({ name: 'flashing', mat: 'galvanized', size: [L + 2 * OVERLAP, 0.004, depth + 0.012], segs: 0, omit: ['ny'], xf: xf({ pos: [0, H + 0.002, T / 2 + (depth + 0.012) / 2 - 0.006] }) });
  },
};

// 地铁砖墙（理发店）：下半截白色斜边地铁砖（贴到 1.2m，按模块坐标贴，周期 1 × 0.6m 整除 2m，一行 7.5cm，
// 1.2m 和 15cm 都正好落在砖缝上），最下面一道 15cm 高的黑色亮釉踢脚砖，砖顶压一道黑色的半圆腰线砖；
// 上半截墨绿色的乳胶漆。背面还是白墙和踢脚线
export const SUBWAY = { base: 0.15, top: 1.2 };
export const wallSubway = {
  id: 'wall_subway',
  name: '地铁砖墙',
  nameEn: 'Subway Tile Wainscot Wall',
  category: 'architecture',
  aoDensity: 80,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 16, az: 30 },
  build(k) {
    const { L, H, T } = WALL;
    const skin = 0.001, sm = { smooth: true };
    wallBox(k, { name: 'wall', x0: -L / 2, x1: L / 2, z1: T / 2 - skin, omit: ['ny', 'pz'], ends: ['nx', 'px'] });
    wallBox(k, { name: 'tile', mat: 'subway', x0: -L / 2, x1: L / 2, y0: SUBWAY.base, y1: SUBWAY.top, z0: T / 2 - skin, omit: ['ny', 'py', 'nz'], ends: ['nx', 'px'] });
    wallBox(k, { name: 'paint', mat: 'plaster_green', x0: -L / 2, x1: L / 2, y0: SUBWAY.top, y1: H, z0: T / 2 - skin, omit: ['ny', 'nz'], ends: ['nx', 'px'] });
    wallEnds(k);
    skirting(k, { name: 'skirtingB', x0: -L / 2, x1: L / 2, zFace: -T / 2, side: -1 });
    const q = (...v) => k.q(...v), d = L - 2 * TRIM_GAP;
    // 踢脚砖：9mm 厚，上沿一道圆鼻
    const base = shape([[0, 0], [0, SUBWAY.base], [-0.004, SUBWAY.base, { r: q(0.004, 0.003, 0), segs: q(2, 1, 1) }], [-0.009, SUBWAY.base - 0.005, { r: q(0.004, 0.003, 0), segs: q(2, 1, 1) }], [-0.009, 0]]);
    k.extrude({ name: 'baseTile', mat: 'tile_black', shape: base, depth: d, axis: 'x', density: { cap0: 0.2, cap1: 0.2 }, xf: xf({ pos: [-L / 2 + TRIM_GAP, 0, T / 2] }) });
    // 腰线砖：半圆截面，背面贴墙
    const n = q(8, 6, 4), r = 0.012, pts = [[0, -r]];
    for (let i = 1; i < n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; pts.push([-r * Math.cos(a), r * Math.sin(a), sm]); }
    pts.push([0, r]);
    k.extrude({ name: 'liner', mat: 'tile_black', shape: shape(pts.reverse()), depth: d, axis: 'x', density: { cap0: 0.2, cap1: 0.2 }, xf: xf({ pos: [-L / 2 + TRIM_GAP, SUBWAY.top, T / 2] }) });
  },
};
