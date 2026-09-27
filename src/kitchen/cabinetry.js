// 厨房柜体的共用部件：面框、嵌入式 Shaker 门板、黄铜杯形拉手。
//
// 做法是英式“面框 + 嵌入门”（inset）：柜体正面先钉一圈 2.5cm 厚的面框，门板嵌在框里、和框面齐平，
// 四周留 2.5mm 的缝。缝里看进去是门板和面框的侧面、再往里是柜体正面 —— 那一面藏在门后 5mm，
// 烘焙 AO 几乎全黑，所以每扇门四周自然有一圈细细的暗线，不用任何贴图。
import { profile, shape } from '../core/shape.js';
import { xf } from '../core/vec.js';

export const GAP = 0.0025; // 门缝

// 一根面框（竖梃或横档）。ys / xs：在这些高度 / 位置上给面加一圈顶点 ——
// 横档的端头顶在竖梃侧面上，竖梃正面在同样的高度也有顶点，两块面的棱一一对上（没有 T 型接缝）
export function frameBox(k, { name, mat, x0, x1, y0, y1, z0, z1, omit = ['nz'], ys = [], xs = [], density }) {
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const nodes = (vals, cc, h) => [-1, ...vals.map((v) => (v - cc) / h).filter((t) => t > -1 + 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b), 1];
  return k.box({
    name, mat, size: [x1 - x0, y1 - y0, z1 - z0], segs: 0, omit, density,
    div: [nodes(xs, c[0], (x1 - x0) / 2), nodes(ys, c[1], (y1 - y0) / 2), 1],
    xf: xf({ pos: c }),
  });
}

// 一整片面框：stiles = [[x0, x1], ...] 竖梃（从 y0 通到 y1），rails = [{ x0, x1, y0, y1 }] 横档（两端顶在竖梃上）。
// 竖梃只在“有横档顶着它”的高度加顶点。top：面框顶上压着台面 / 柜顶，顶面不生成。
// 横档的 omit 追加要省掉的面，keep 留下默认省掉的端面（比如水槽旁边的窄条，一头顶着竖梃、一头露在外面）
export function faceFrame(k, { name, mat, z0, z1, y0, y1, stiles, rails, top = true, bottom = true, extraYs = [] }) {
  const touch = (s, r) => Math.abs(r.x0 - s[1]) < 1e-6 || Math.abs(r.x1 - s[0]) < 1e-6;
  stiles.forEach((s, i) => {
    const ys = [...extraYs, ...rails.filter((r) => touch(s, r)).flatMap((r) => [r.y0, r.y1])];
    frameBox(k, {
      name: `${name}Stile${i}`, mat, x0: s[0], x1: s[1], y0, y1, z0, z1, ys,
      omit: ['nz', ...(top ? ['py'] : []), ...(bottom ? [] : ['ny'])],
    });
  });
  rails.forEach((r, i) => frameBox(k, {
    name: `${name}Rail${i}`, mat, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, z0, z1,
    omit: [...['nz', 'px', 'nx'].filter((f) => !(r.keep ?? []).includes(f)), ...(r.omit ?? [])],
  }));
}

// 截面点列 → 逆时针的闭合截面（点可以按任意方向给）
export function ccwShape(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  return shape(area < 0 ? [...pts].reverse() : pts);
}

// Shaker 门板截面（开放轮廓；x 朝门中心为正，y 离开门背面）：
// 从芯板面沿框的内缘上来（内缘一道小倒角）→ 框面 → 外缘小圆角 → 外侧面一直到门背面（门缝里看得见）
function shakerProfile(k, fw, t, pd) {
  const q = (...v) => k.q(...v);
  return profile([
    [fw / 2, t - pd],
    [fw / 2, t, { r: q(0.0015, 0, 0), segs: 1 }],
    [-fw / 2, t, { r: q(0.002, 0, 0), segs: 1 }],
    [-fw / 2, 0],
  ]);
}

// 一扇嵌入式 Shaker 门板 / 抽屉面板：x0..x1 × y0..y1，门背面在 z，正面在 z + t。
// 门框是一圈闭合扫掠（四角斜接）；芯板是一张面，比框面凹进 pd，四边伸进框底下 5mm
export function shakerFront(k, { name, mat, x0, x1, y0, y1, z, t = 0.02, fw = 0.055, pd = 0.007 }) {
  const c = fw / 2;
  // LOD2：整扇门只剩一张和面框齐平的面（借用芯板的 AO 图块）—— 四周的门缝还在，远看依然是一扇扇门
  if (k.lod >= 2) {
    k.box({
      name: `${name}Panel`, mat, size: [x1 - x0, y1 - y0, 0.002], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'],
      xf: xf({ pos: [(x0 + x1) / 2, (y0 + y1) / 2, z + t - 0.001] }),
    });
    return;
  }
  k.sweep({
    name, mat, shape: shakerProfile(k, fw, t, pd), closed: true, caps: [false, false], up: [0, 0, 1],
    path: [[x0 + c, y0 + c, z], [x1 - c, y0 + c, z], [x1 - c, y1 - c, z], [x0 + c, y1 - c, z]],
  });
  k.box({
    name: `${name}Panel`, mat, size: [x1 - x0 - 2 * fw + 0.01, y1 - y0 - 2 * fw + 0.01, 0.002], segs: 0,
    omit: ['nz', 'px', 'nx', 'py', 'ny'], density: { pz: 0.7 },
    xf: xf({ pos: [(x0 + x1) / 2, (y0 + y1) / 2, z + t - pd - 0.001] }),
  });
}

// 黄铜杯形拉手（bin pull）：一片四分之一椭圆的壳，口朝下，两头各一块挡板。
// 原点在拉手上沿中点（贴在面板上），壳向 +z 伸出 d、向下 h；rotY 转到别的朝向（岛台背面的抽屉朝 -z）
export function cupPull(k, { name, mat = 'brass', pos, w = 0.086, h = 0.03, d = 0.021, t = 0.0022, rotY = 0 }) {
  const q = (...v) => k.q(...v);
  const n = q(3, 1);
  // 截面在 (z, y) 平面：外弧从面板上沿 (0, 0) 出发，向外、向下到唇口 (d, -h)；内弧比外弧小一个壁厚
  const arc = (s, a) => [(d - s) * Math.sin(a), -h + (h - s) * Math.cos(a)];
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([...arc(0, (i / n) * (Math.PI / 2)), i === 0 || i === n ? {} : { smooth: true }]);
  for (let i = n; i >= 0; i--) pts.push([...arc(t, (i / n) * (Math.PI / 2)), i === 0 || i === n ? {} : { smooth: true }]);
  // 挤出方向 x：截面 X → -Z，所以 z 取负；点序按截面空间逆时针
  const toShape = (list) => ccwShape(list.map(([z, y, o]) => [-z, y, o]));
  const place = (x) => xf({ pos: [pos[0], pos[1], pos[2]], rot: [0, rotY, 0] }).mul(xf({ pos: [x, 0, 0] }));
  k.extrude({ name: `${name}Shell`, mat, shape: toShape(pts), depth: w, axis: 'x', caps: [false, false], density: { side: 0.5 }, xf: place(-w / 2) });
  // 挡板：四分之一椭圆（填满），夹在壳的两端里面（LOD1 远看只剩一个黄铜小点，省掉）
  if (k.lod > 0) return;
  const sector = [[0, -h, {}]];
  for (let i = n; i >= 0; i--) sector.push([...arc(0, (i / n) * (Math.PI / 2)), i === 0 || i === n ? {} : { smooth: true }]);
  for (const s of [-1, 1]) {
    k.extrude({
      name: `${name}End${s > 0 ? 'R' : 'L'}`, mat, shape: toShape(sector), depth: t, axis: 'x', density: { side: 0.3, cap0: 0.3, cap1: 0.3 },
      xf: place(s > 0 ? w / 2 - t : -w / 2),
    });
  }
}
