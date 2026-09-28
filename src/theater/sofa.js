import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { theaterUV, THEATER_ATLAS } from '../materials/atlas.js';
import { sw, mapUV, ccw } from './parts.js';

// 影音沙发：三座电动躺椅连成一排，座与座之间是带杯架的扶手箱，午夜蓝丝绒。
//   · 每一座：坐垫鼓起来，前沿圆；靠背是一块三道横向压线的软垫（形变把两道压线往里拉，压线之间各鼓成一个小枕头），
//     顶上一个枕头式的头枕；靠背连着后面的外壳一起绕座面后沿转动。坐直时后仰 9°；
//   · +x 那一座（坐在沙发上看是最左边）躺下了：靠背后仰 30°，脚托从座前翻起来、几乎水平地伸出去，底下露出黑色的连杆；
//   · 扶手箱：后半截是可以掀开的软垫盖，前半截是一块黑色的托盘，挖着两个杯架 —— 托盘沿杯架的中线分成左右两半，
//     每半是一个带两个半圆缺口的简单多边形（和博古架的月洞一样），孔里是不锈钢的杯套，口沿里一圈蓝色的灯；
//   · 每一座左手边（+x 一侧）的扶手 / 扶手箱内侧有一小块按键（躺下、坐起两个箭头和一个 USB-C 口，图集里画的）；
//   · 底下是往里缩进去的黑色底座，整张沙发像是浮在地上。
// 原点在沙发占地的中心（地面上），坐的人朝 +z
const ARM = 0.16, SEAT = 0.56, CONS = 0.22;
export const SOFA = { W: 2 * ARM + 3 * SEAT + 2 * CONS, D: 0.94 };
const seatX = (i) => -SOFA.W / 2 + ARM + SEAT / 2 + i * (SEAT + CONS);
const consX = (j) => -SOFA.W / 2 + ARM + SEAT + CONS / 2 + j * (SEAT + CONS);
const PIVOT = { y: 0.4, z: -0.26 };   // 靠背转轴
const CUP = { r: 0.042, z: [0.145, 0.34], y: 0.61, depth: 0.085 };

export default {
  id: 'theater_sofa',
  name: '影音沙发',
  nameEn: 'Theater Recliner Sofa',
  category: 'theater',
  aoDensity: 150,
  shadow: { margin: 0.2, maxDist: 0.5, density: 70 },
  view: { el: 18, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const { W, D } = SOFA;
    const vel = (name, o) => k.box({ name, mat: 'velvet_ink', ...o });

    // —— 底座：黑色、四周缩进 3cm ——
    sw(k.box({ name: 'plinth', mat: 'theater', size: [W - 0.06, 0.05, D - 0.08], segs: 0, omit: ['ny', 'py'], xf: xf({ pos: [0, 0.025, -0.01] }) }), 'plastic');

    // —— 两头的扶手 ——
    for (const s of [-1, 1]) {
      vel(`arm${s > 0 ? 'R' : 'L'}`, {
        size: [ARM, 0.6, 0.92], r: q(0.05, 0.04, 0.03), segs: q(2, 2, 1), div: q([1, 2, 3], [1, 1, 2], 1), puff: q({ top: 0.008, side: 0.006 }, { top: 0.006 }, null),
        omit: ['ny'], grain: 'z', xf: xf({ pos: [s * (W / 2 - ARM / 2), 0.35, 0] }),
      });
    }

    // —— 扶手箱：箱体（顶面敞开，托盘和盖子盖在上面）、软垫盖、两半托盘、杯套和灯圈 ——
    for (let j = 0; j < 2; j++) {
      const cx = consX(j);
      vel(`console${j}`, { size: [CONS, 0.54, 0.92], r: q(0.02, 0.015, 0), segs: q(2, 1, 0), omit: ['ny', 'py'], grain: 'z', xf: xf({ pos: [cx, 0.32, 0] }) });
      vel(`lid${j}`, {
        size: [CONS, 0.06, 0.5], r: q(0.028, 0.022, 0.015), segs: q(2, 1, 1), div: q([2, 1, 3], [1, 1, 2], 1), puff: q({ top: 0.008 }, { top: 0.006 }, null),
        omit: ['ny'], grain: 'z', xf: xf({ pos: [cx, 0.62, -0.21] }),
      });
      // 托盘：沿杯架中线（x = 0）分成两半，每半两处半圆缺口
      const r = CUP.r, na = q(6, 4, 3);
      const half = (sx) => {
        const pts = [[0, 0.04], [0.108, 0.04], [0.108, 0.455], [0, 0.455]];
        for (const zc of [...CUP.z].reverse()) {
          for (let i = 0; i <= na; i++) {
            const th = Math.PI / 2 - (Math.PI * i) / na;
            pts.push([r * Math.cos(th), zc + r * Math.sin(th), i === 0 || i === na ? {} : { smooth: true }]);
          }
        }
        // (x, z) → 挤出轴 'y' 的截面坐标 (x, -z)
        return shape(ccw(pts.map(([x, z, o]) => [sx * x, -z, o])));
      };
      for (const sx of [-1, 1]) {
        sw(k.extrude({
          name: `tray${j}${sx > 0 ? 'R' : 'L'}`, mat: 'theater', shape: half(sx), depth: 0.02, axis: 'y',
          bevel: [0, q(0.003, 0.002, 0)], bsegs: 1, caps: [false, true], xf: xf({ pos: [cx, CUP.y - 0.02, 0] }),
        }), 'plastic');
      }
      for (const [c, zc] of CUP.z.entries()) {
        const place = xf({ pos: [cx, CUP.y, zc] });
        sw(k.lathe({
          name: `cup${j}${c}`, mat: 'theater', segs: q(12, 8, 6),
          profile: profile([[r + 0.004, 0.0], [r + 0.004, 0.003, { r: 0.0012, segs: 1 }], [r - 0.001, 0.0035], [r - 0.002, -CUP.depth + 0.006, { r: 0.006, segs: 1 }], [0, -CUP.depth]]),
          xf: place,
        }), 'steel');
        if (k.lod < 2) sw(k.lathe({ name: `led${j}${c}`, mat: 'theater', segs: q(12, 8), profile: profile([[r - 0.0028, 0.0], [r - 0.0028, -0.006]]), xf: place }), 'ledBlue');
      }
    }

    // —— 三座 ——
    for (let i = 0; i < 3; i++) {
      const x = seatX(i);
      const recline = i === 2;
      // 座框、坐垫
      // 座框一直延伸到沙发背后（从后面看，靠背外壳底下是封死的）
      vel(`base${i}`, { size: [SEAT, 0.33, 0.85], r: q(0.01, 0), segs: q(1, 0), omit: ['ny'], grain: 'x', xf: xf({ pos: [x, 0.215, -0.025] }) });
      vel(`cushion${i}`, {
        size: [SEAT - 0.02, 0.13, 0.62], r: q(0.045, 0.035, 0.02), segs: q(2, 2, 1), div: q([3, 1, 3], [2, 1, 2], 1), puff: q({ top: 0.016, side: 0.004 }, { top: 0.012 }, null),
        omit: ['ny'], grain: 'x', xf: xf({ pos: [x, 0.425, 0.13 + (recline ? 0.03 : 0)] }),
      });
      // 脚托：坐直时是座前的一块竖板；躺下时翻起来往前伸
      {
        const size = [SEAT - 0.06, 0.26, 0.08];
        const deform = (p) => [p[0], p[1], p[2] + (p[2] > 0 ? 0.01 * (1 - (p[0] / 0.25) ** 2) * (1 - (p[1] / 0.13) ** 2) : 0)];
        const o = { size, r: q(0.03, 0.025, 0.015), segs: q(2, 1, 1), div: q([2, 1, 1], 1, 1), deform, grain: 'x' };
        if (!recline) vel(`foot${i}`, { ...o, xf: xf({ pos: [x, 0.21, 0.43] }) });
        else {
          const th = -1.39;
          vel(`foot${i}`, { ...o, xf: xf({ pos: [x, 0.39, 0.47] }).mul(xf({ rot: [th, 0, 0] })).mul(xf({ pos: [0, -0.13, -0.04] })) });
          // 连杆：座框前沿到脚托底下，每边两根交叉的黑钢条
          if (k.lod < 2) {
            for (const s of [-1, 1]) {
              for (const [n, a, b] of [['A', [0.1, 0.4], [0.33, 0.68]], ['B', [0.3, 0.4], [0.24, 0.66]]]) {
                const dy = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dy, dz);
                sw(k.box({ name: `link${i}${s > 0 ? 'R' : 'L'}${n}`, mat: 'theater', size: [0.01, 0.014, L], segs: 0,
                  xf: xf({ pos: [x + s * 0.2, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2], rot: [-Math.atan2(dy, dz), 0, 0] }) }), 'satinBlack');
              }
            }
          }
        }
      }
      // 靠背：外壳 + 三道压线的靠垫 + 头枕，一起绕转轴后仰
      const tilt = recline ? 0.52 : 0.16;
      const B = xf({ pos: [x, PIVOT.y, PIVOT.z], rot: [-tilt, 0, 0] });
      vel(`shell${i}`, { size: [SEAT, 0.68, 0.12], r: q(0.03, 0.02, 0.01), segs: q(2, 1, 1), omit: ['ny'], grain: 'y', xf: B.mul(xf({ pos: [0, 0.3, -0.15] })) });
      {
        const h = [0.26 - 0.03, 0.21 - 0.03];   // 内核半宽、半高（减去圆角）
        const g = [-0.07, 0.07].map((y) => y / h[1]);
        const nodes = [-1, -0.62, g[0] - 0.1, g[0], g[0] + 0.1, 0, g[1] - 0.1, g[1], g[1] + 0.1, 0.62, 1];
        vel(`back${i}`, {
          size: [0.52, 0.42, 0.17], r: q(0.03, 0.025, 0.015), segs: q(2, 1, 1), div: q([3, nodes, 1], [2, [-1, g[0], 0, g[1], 1], 1], 1), grain: 'y', omit: ['nz'],
          deform: (p) => {
            const front = Math.max(0, p[2] / 0.085);
            const groove = Math.exp(-(((p[1] + 0.07) / 0.012) ** 2)) + Math.exp(-(((p[1] - 0.07) / 0.012) ** 2));
            const crown = 0.016 * Math.max(0, 1 - (p[0] / 0.27) ** 2);
            return [p[0], p[1], p[2] + front * (crown * (1 - groove) - 0.012 * groove)];
          },
          xf: B.mul(xf({ pos: [0, 0.31, -0.005] })),
        });
      }
      vel(`head${i}`, {
        size: [0.5, 0.15, 0.15], r: q(0.05, 0.04, 0.025), segs: q(2, 2, 1), div: q([3, 1, 1], [2, 1, 1], 1), puff: q({ top: 0.01, side: 0.01 }, { top: 0.008 }, null),
        grain: 'x', xf: B.mul(xf({ pos: [0, 0.585, -0.01] })),
      });
      // 按键：这一座左手边（+x 一侧）的扶手 / 扶手箱内侧
      {
        const { w: CW, h: CH } = THEATER_ATLAS.control;
        const face = i < 2 ? consX(i) - CONS / 2 : W / 2 - ARM;
        const zc = 0.3, yc = 0.53;
        const panel = k.box({ name: `ctrl${i}`, mat: 'theater', size: [0.002, CH, CW], segs: 0, omit: ['px'], xf: xf({ pos: [face - 0.001, yc, zc] }) });
        mapUV(panel, (p, n) => (n[0] < -0.7 ? theaterUV('control', (zc + CW / 2 - p[2]) / CW, (yc + CH / 2 - p[1]) / CH) : theaterUV('control', 0.99, 0.5)));
      }
    }
  },
};
