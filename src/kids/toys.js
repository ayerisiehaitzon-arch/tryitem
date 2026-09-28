import { shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { toyUV } from '../materials/atlas.js';

// 儿童房里的小东西：全部用玩具调色板（toys 材质）—— 每个部件的 UV 指向一个颜色格子，
// 彩虹积木、小房子、方块、绘本……颜色各不相同，但只占一个材质、一次 draw call。

// 把部件整个涂成调色板里的一种颜色
export function paint(part, color) {
  const uv = toyUV(color);
  part.T = part.T.map(() => uv);
  return part;
}

// 沿局部 z 轴压扁一个部件（在摆放之前调用）：位置 z 乘 s，法线按逆转置变换（z 分量除以 s）再归一化。
// 车削出来的纺锤压扁以后就是一片边缘圆润的“叶片”：兔子耳朵
export function squash(part, s) {
  part.P = part.P.map((p) => [p[0], p[1], p[2] * s]);
  part.N = part.N.map((n) => { const m = [n[0], n[1], n[2] / s], l = Math.hypot(...m) || 1; return [m[0] / l, m[1] / l, m[2] / l]; });
  return part;
}

// 彩虹叠叠乐：一组同心的半圆拱（半个圆环的挤出），从外到内依次 colors。
// 原点在最外一道拱的底边中点，拱立在 XY 平面里、厚度沿 z。
export function rainbow(k, { name, colors, R = 0.14, w = 0.021, depth = 0.034, place }) {
  const q = (...v) => k.q(...v);
  const gap = 0.0006; // 拱和拱之间一点点缝（真的积木是一块块分开的）
  // 大拱多分几段，小拱少几段（剪影误差差不多）。一道拱的内弧和里面一道拱的外弧分段数相同、角度对齐：
  // 两条折线平行，缝处处一样宽（分段不同的话，折线的弦会切进里面那道拱）
  const segs = colors.map((_, i) => Math.max(q(5, 4, 3), Math.round(q(11, 7, 5) * Math.sqrt((R - i * w) / R))));
  colors.forEach((c, i) => {
    const Ro = R - i * w, Ri = Math.max(0.012, Ro - w + gap);
    const no = segs[i];
    const ni = i < colors.length - 1 ? segs[i + 1] : Math.max(3, Math.round(no * 0.7));
    const e = {};
    const pts = [[Ro, 0, e]];
    for (let j = 1; j < no; j++) {
      const a = (Math.PI * j) / no;
      pts.push([Ro * Math.cos(a), Ro * Math.sin(a), { smooth: true }]);
    }
    pts.push([-Ro, 0, e], [-Ri, 0, e]);
    for (let j = ni - 1; j >= 1; j--) {
      const a = (Math.PI * j) / ni;
      pts.push([Ri * Math.cos(a), Ri * Math.sin(a), { smooth: true }]);
    }
    pts.push([Ri, 0, e]);
    const part = k.extrude({
      name: `${name}${i}`, mat: 'toys', shape: shape(pts), depth, center: true, axis: 'z',
      // 只有朝外的正面（+z）倒圆边：彩虹面向房间，背面对着墙
      caps: [true, true], bevel: [0, q(0.0018, 0, 0)], bsegs: 1, xf: place,
    });
    paint(part, c);
  });
}

// 一块圆角方块积木
export function block(k, { name, size, color, pos, rot = [0, 0, 0] }) {
  const q = (...v) => k.q(...v);
  const part = k.box({
    name, mat: 'toys', size, r: q(0.003, 0.002, 0), segs: q(1, 1, 0), omit: ['ny'],
    xf: xf({ pos: [pos[0], pos[1] + size[1] / 2, pos[2]], rot }),
  });
  return paint(part, color);
}

// 小木房子：房身（五边形的挤出）+ 屋顶（一条人字形的挤出，比房身前后各长出一点）
// 原点在房子底面中心；w 宽、h 墙高、d 进深
export function house(k, { name, w, h, d, body, roof, place }) {
  const q = (...v) => k.q(...v);
  const ridge = h + w / 2;
  const walls = k.extrude({
    name: `${name}Body`, mat: 'toys', axis: 'z', center: true, depth: d,
    shape: shape([[-w / 2, 0], [w / 2, 0], [w / 2, h], [0, ridge], [-w / 2, h]]),
    caps: [true, true], bevel: [0, q(0.0012, 0, 0)], bsegs: 1, xf: place,
  });
  paint(walls, body);
  // 屋顶：人字形的板，厚 t，檐口挑出 o
  const t = 0.008, o = 0.008, s = Math.SQRT1_2;
  const ex = w / 2 + o;
  const pts = [
    [-ex, h - o], [0, ridge], [ex, h - o],
    [ex + t * s, h - o + t * s], [0, ridge + t / s], [-ex - t * s, h - o + t * s],
  ];
  const cap = k.extrude({
    name: `${name}Roof`, mat: 'toys', axis: 'z', center: true, depth: d + 0.008,
    shape: shape(pts), caps: [true, true], xf: place,
  });
  paint(cap, roof);
}

// 绘本：硬壳封面（有颜色的实心块）+ 书页（米白的薄块，夹在两块封面板之间，从上、下、切口三边露出半毫米）——
// 从外面看就是两块彩色封面夹着一条米白的书页。原点在书脊底端的中点，书脊朝 +z
export function pictureBook(k, { name, w, h, t, color, place }) {
  const q = (...v) => k.q(...v);
  const c = 0.0018; // 封面板的厚度
  paint(k.box({
    name: `${name}Cover`, mat: 'toys', size: [t, h, w], segs: 0,
    xf: place.mul(xf({ pos: [0, h / 2, -w / 2] })),
  }), color);
  if (k.lod < 2) {
    const L = w - 0.0035; // 从切口外 0.5mm 到书脊里 4mm
    paint(k.box({
      name: `${name}Pages`, mat: 'toys', size: [t - 2 * c, h + 0.001, L], segs: 0, omit: ['pz'],
      xf: place.mul(xf({ pos: [0, h / 2, -0.004 - L / 2] })),
    }), 'cream');
  }
}
