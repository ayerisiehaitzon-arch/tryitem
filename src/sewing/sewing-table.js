import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { SEW_ATLAS, sewUV, sewSwatch, threadUV } from '../materials/atlas.js';
import { MACHINE, bodyOutline } from './layout.js';
import { sw, mapUV, rod, pin, spool, scissors, ccw, catmull } from './parts.js';

// 缝纫机桌：橡木桌面、白漆的锥形腿，桌裙右边一个小抽屉（黄铜小圆钮）。桌上一台暖白色的家用电子缝纫机：
//   · 机身是一整块“⅃”形的轮廓挤出（立柱 + 横臂 + 机头，四周倒圆），比底座薄一点、往后缩；正面按图集平面贴 ——
//     机头上一块薄荷绿的面板和穿线槽，横臂上 TRYITEM 和一排针迹表，立柱上发光的液晶屏、三个小按钮和花样旋钮；
//   · 右侧一个手轮，顶上一根线轴柱插着一轴深蓝的线（线从线轴引到机头），旁边绕线器上一个梭芯；
//   · 机头底下：针杆和针、压脚杆和压脚、一盏缝纫灯（自发光），底座上一块针板（送布牙的槽、缝份导线）；
//   · 一块碎花棉布从压脚底下穿过，顺着底座前沿垂到桌面上，再从桌子前沿垂下去；
//   · 右边一个番茄针插（插着几根彩色珠头的大头针）、一颗草莓磨针包、一把橙色手柄的裁缝剪、一轴备用的线。
// 原点在桌子正下方的地面，正面（坐人的一边）朝 +z。
const TABLE = { w: 1.1, d: 0.55, h: 0.75, t: 0.03 };
const MX = -0.13, MZ = -0.05;              // 缝纫机在桌面上的位置（底座中心）
const THREAD = 22;                          // 线轴上的线：深蓝

export default {
  id: 'sewing_table',
  name: '缝纫机桌',
  nameEn: 'Sewing Table with Machine',
  category: 'sewing',
  aoDensity: 300,
  shadow: { margin: 0.14, maxDist: 0.8, density: 110 },
  view: { el: 18, az: 20 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const { w, d, h, t } = TABLE;

    // —— 桌子 ——
    k.extrude({ name: 'top', mat: 'oak', shape: rect(w, d, { r: 0.012, segs: q(3, 2, 1) }), depth: t, axis: 'y', bevel: { w: 0.003, h: 0.003 }, bsegs: q(2, 1, 1), grain: 'across', xf: xf({ pos: [0, h - t, 0] }) });
    const lx = w / 2 - 0.05, lz = d / 2 - 0.05, apron = 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.extrude({ name: `leg${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, mat: 'paint', shape: rect(0.032, 0.032, { r: 0.004, segs: q(2, 1, 1) }), depth: h - t, taper: 1.45, axis: 'y', caps: [true, false], bevel: 0.002, xf: xf({ pos: [sx * lx, 0, sz * lz] }) });
    }
    const ay = h - t - apron / 2;
    k.box({ name: 'apronB', mat: 'paint', size: [2 * lx, apron, 0.018], segs: 0, xf: xf({ pos: [0, ay, -lz] }) });
    for (const sx of [-1, 1]) k.box({ name: `apron${sx > 0 ? 'R' : 'L'}`, mat: 'paint', size: [0.018, apron, 2 * lz], segs: 0, xf: xf({ pos: [sx * lx, ay, 0] }) });
    k.box({ name: 'apronF', mat: 'paint', size: [2 * lx, apron, 0.018], segs: 0, xf: xf({ pos: [0, ay, lz] }) });
    // 抽屉面板略凸出桌裙一点，四周一道缝
    k.box({ name: 'drawer', mat: 'paint', size: [0.34, apron - 0.016, 0.016], r: 0.002, segs: q(1, 1, 0), xf: xf({ pos: [0.24, ay, lz + 0.013] }) });
    sw(k.lathe({ name: 'knob', mat: 'sewing', segs: q(10, 8, 6), profile: profile([[0.005, 0], [0.006, 0.006, sm], [0.011, 0.012, sm], [0.009, 0.019, sm], [0, 0.02]]), xf: xf({ pos: [0.24, ay, lz + 0.021], rot: [Math.PI / 2, 0, 0] }) }), 'brass');

    // —— 缝纫机（先在机身坐标里搭，最后整体放到桌面上）——
    const machine = [];
    const add = (p) => { machine.push(p); return p; };
    const M = SEW_ATLAS.machine;
    const front = (p) => sewUV('machine', (p[0] - M.x0) / M.w, (M.h - p[1]) / M.h);
    {
      const B = MACHINE.bed;
      const bed = add(k.box({ name: 'bed', mat: 'sewing', size: [B.x1 - B.x0, B.h, B.z1 - B.z0], r: 0.012, segs: q(2, 1, 1), omit: ['ny'], xf: xf({ pos: [(B.x0 + B.x1) / 2, B.h / 2, (B.z0 + B.z1) / 2] }) }));
      mapUV(bed, front);
      // 上半身：“⅃”形轮廓挤出，四周倒圆；背面贴纯白
      const { z0, z1 } = MACHINE.body;
      const body = add(k.extrude({ name: 'body', mat: 'sewing', shape: shape(ccw(bodyOutline().map(([x, y, r]) => [x, y, r ? { r, segs: q(4, 3, 2) } : {}]))), depth: z1 - z0, bevel: { w: 0.01, h: 0.01 }, bsegs: q(3, 2, 1), xf: xf({ pos: [0, 0, z0] }) }));
      const white = sewSwatch('machineWhite');
      mapUV(body, (p, n) => (n[2] < -0.9 ? white : front(p)));
      // 花样旋钮（正面也按机身的图平面贴：盘面上的 1 ~ 8、边上一圈防滑纹都在图里）
      const D = MACHINE.dial;
      mapUV(add(k.lathe({ name: 'dial', mat: 'sewing', segs: q(20, 14, 10), profile: profile([[D.r, -0.002], [D.r, 0.009, sm], [D.r - 0.002, 0.012, sm], [0, 0.013]]), xf: xf({ pos: [D.x, D.y, z1], rot: [Math.PI / 2, 0, 0] }) })), front);
      // 倒车扳手
      sw(add(k.box({ name: 'reverse', mat: 'sewing', size: [0.012, 0.02, 0.01], r: 0.003, segs: q(2, 1, 0), xf: xf({ pos: [0.19, 0.088, z1 + 0.003] }) })), 'machineGray');
      // 挑线杆：从机头正面的长槽里伸出来
      sw(add(k.box({ name: 'takeUp', mat: 'sewing', size: [0.006, 0.008, 0.014], r: 0.002, segs: q(1, 1, 0), xf: xf({ pos: [-0.18, 0.262, z1 + 0.004] }) })), 'chrome');
      // 手轮：立柱右侧，沿 x 车削
      sw(add(k.lathe({ name: 'handwheel', mat: 'sewing', segs: q(20, 14, 10), profile: profile([[0.02, -0.003], [0.034, 0, { r: 0.003 }], [0.036, 0.006, sm], [0.036, 0.016, sm], [0.033, 0.022, sm], [0.014, 0.024, sm], [0.009, 0.029, sm], [0, 0.03]]), xf: xf({ pos: [MACHINE.pillar.x1, 0.255, -0.01], rot: [0, 0, -Math.PI / 2] }) })), 'machineGray');
      sw(add(k.lathe({ name: 'handwheelRing', mat: 'sewing', segs: q(20, 14, 10), profile: profile([[0.0365, 0.009], [0.0368, 0.0105, sm], [0.0368, 0.0125, sm], [0.0365, 0.014]]), xf: xf({ pos: [MACHINE.pillar.x1, 0.255, -0.01], rot: [0, 0, -Math.PI / 2] }) })), 'accent');
      // 线轴柱 + 一轴线；绕线器上一个梭芯
      const top = MACHINE.arm.y1;
      add(rod(k, 'spoolPin', [0.14, top - 0.004, -0.035], [0.14, top + 0.062, -0.035], 0.0025, 'chrome', { segs: q(6, 5, 4) }));
      for (const p of spool(k, 'spool', { color: THREAD, place: xf({ pos: [0.14, top + 0.002, -0.035] }) })) add(p);
      add(rod(k, 'winderPin', [0.19, top - 0.004, -0.035], [0.19, top + 0.02, -0.035], 0.002, 'chrome', { segs: q(6, 5, 4) }));
      sw(add(k.lathe({ name: 'bobbin', mat: 'sewing', segs: q(10, 8, 6), profile: profile([[0.003, 0], [0.0105, 0], [0.0105, 0.0012], [0.007, 0.0015], [0.007, 0.0085], [0.0105, 0.0088], [0.0105, 0.01], [0.003, 0.01]]), xf: xf({ pos: [0.19, top + 0.004, -0.035] }) })), 'chrome');
      // 线：从线轴引到机头顶上的过线钩，再绕到机头正面；针上还有一小段
      const tUV = threadUV(THREAD, 0.5, 0.5);
      const tpath = catmull([[0.127, top + 0.03, -0.035], [0.0, top + 0.012, -0.034], [-0.14, top + 0.004, -0.03], [-0.15, top + 0.002, 0.02], [-0.15, top - 0.012, z1 + 0.002]], q(4, 3, 2));
      const thr = add(k.sweep({ name: 'thread', mat: 'sewing', shape: circle(0.0006, 3), path: tpath, up: [0, 1, 0], caps: [false, false] }));
      thr.T = thr.T.map(() => tUV);
      sw(add(k.box({ name: 'threadGuide', mat: 'sewing', size: [0.008, 0.004, 0.006], r: 0.0015, segs: q(1, 1, 0), xf: xf({ pos: [-0.14, top + 0.001, -0.03] }) })), 'chrome');
      // 机头底下：针杆、针夹、针、压脚杆、压脚，一盏缝纫灯
      const N = MACHINE.needle, hy = MACHINE.head.y0, bedTop = MACHINE.bed.h;
      add(rod(k, 'needleBar', [N.x, hy + 0.002, N.z], [N.x, 0.099, N.z], 0.0028, 'chrome', { segs: q(8, 6, 4) }));
      sw(add(k.box({ name: 'needleClamp', mat: 'sewing', size: [0.008, 0.007, 0.008], r: 0.0015, segs: q(1, 1, 0), xf: xf({ pos: [N.x, 0.1, N.z] }) })), 'chrome');
      add(rod(k, 'needle', [N.x, 0.097, N.z], [N.x, bedTop + 0.0045, N.z], 0.0007, 'steel', { segs: 4 }));
      const nt = add(rod(k, 'needleThread', [N.x + 0.0008, hy - 0.004, N.z + 0.004], [N.x + 0.0008, bedTop + 0.009, N.z + 0.001], 0.00035, null, { segs: 3, caps: [false, false] }));
      nt.T = nt.T.map(() => tUV);
      add(rod(k, 'presserBar', [N.x, hy + 0.002, N.z - 0.016], [N.x, 0.086, N.z - 0.016], 0.003, 'chrome', { segs: q(8, 6, 4) }));
      sw(add(k.box({ name: 'presserShank', mat: 'sewing', size: [0.012, 0.012, 0.014], r: 0.002, segs: q(1, 1, 0), xf: xf({ pos: [N.x, 0.082, N.z - 0.012] }) })), 'chrome');
      sw(add(k.box({ name: 'presserFoot', mat: 'sewing', size: [0.018, 0.0035, 0.03], r: 0.0012, segs: q(1, 1, 0), xf: xf({ pos: [N.x, bedTop + 0.0035, N.z - 0.004] }) })), 'chrome');
      sw(add(k.box({ name: 'lamp', mat: 'sewing', size: [0.022, 0.0015, 0.018], segs: 0, omit: ['py'], xf: xf({ pos: [-0.192, hy - 0.0006, 0.018] }) })), 'led');
      // 针板：针孔在正中，按图集里的针板平面贴
      const PL = SEW_ATLAS.plate.size;
      const plate = add(k.box({ name: 'needlePlate', mat: 'sewing', size: [PL, 0.0012, PL], segs: 0, omit: ['ny'], xf: xf({ pos: [N.x, bedTop + 0.0006, N.z] }) }));
      mapUV(plate, (p) => sewUV('plate', (p[0] - N.x) / PL + 0.5, (p[2] - N.z) / PL + 0.5));
    }
    const place = xf({ pos: [MX, h, MZ] });
    for (const p of machine) p.transform(place);

    // —— 一块碎花布：从压脚底下穿过，顺着底座前沿垂到桌面，再从桌子前沿垂下去 ——
    {
      const B = MACHINE.bed, xc = MX - 0.08, halfW = 0.12, top = h + B.h + 0.0016, tz = d / 2;
      const path = catmull([
        [xc, top, MZ - 0.075], [xc, top, MZ + B.z1 - 0.014], [xc, top - 0.012, MZ + B.z1 + 0.006], [xc, h + 0.03, MZ + B.z1 + 0.03],
        [xc, h + 0.006, MZ + B.z1 + 0.062], [xc, h + 0.0012, MZ + B.z1 + 0.1], [xc, h + 0.0012, tz - 0.012],
        [xc, h - 0.004, tz + 0.004], [xc, h - 0.03, tz + 0.008], [xc, h - 0.2, tz + 0.012],
      ], q(4, 3, 2)).map((p) => (p[2] < tz - 0.004 ? [p[0], Math.max(p[1], h + 0.0015), p[2]] : p));   // 样条在转平的地方会往下冲一点，别让布钻进桌面
      const n = q(10, 7, 4), pts = Array.from({ length: n + 1 }, (_, i) => [halfW - (2 * halfW * i) / n, 0, sm]);
      const cloth = k.sweep({ name: 'fabric', mat: 'calico', shape: shape(pts, { closed: false }), path, up: [0, 1, 0], caps: [false, false] });
      const sst = (e0, e1, v) => { const u = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
      cloth.deform(([x, y, z]) => {
        const u = x - xc;
        const droop = sst(MZ + B.z1, MZ + B.z1 + 0.02, z) * (1 - sst(MZ + B.z1 + 0.04, MZ + B.z1 + 0.06, z));
        const hang = sst(h - 0.01, h - 0.12, y);
        return [x, y + 0.004 * Math.sin(u * 48 + 1) * droop, z + 0.012 * Math.sin(u * 40) * hang];
      });
    }

    // —— 番茄针插、草莓磨针包、大头针 ——
    {
      const cx = 0.34, cz = -0.07;
      const tomato = k.lathe({ name: 'tomato', mat: 'sewing', segs: q(16, 12, 8), profile: profile([[0, 0], [0.028, 0.003, sm], [0.041, 0.02, sm], [0.036, 0.04, sm], [0.014, 0.05, sm], [0, 0.047]]) });
      tomato.deform(([x, y, z]) => { const a = Math.atan2(z, x), f = 1 - 0.06 * (0.5 - 0.5 * Math.cos(8 * a)) * Math.min(1, y / 0.03); return [x * f, y, z * f]; });
      sw(tomato, 'tomato').transform(xf({ pos: [cx, h, cz] }));
      const star = [];
      for (let i = 0; i < 10; i++) { const a = (Math.PI * i) / 5, r = i % 2 ? 0.006 : 0.017; star.push([r * Math.cos(a), r * Math.sin(a)]); }
      sw(k.extrude({ name: 'calyx', mat: 'sewing', shape: shape(ccw(star)), depth: 0.002, axis: 'y', xf: xf({ pos: [cx, h + 0.0465, cz], rot: [0, 0.3, 0] }) }), 'leaf');
      rod(k, 'stem', [cx, h + 0.047, cz], [cx + 0.002, h + 0.056, cz], 0.0016, 'leaf', { segs: 4 });
      // 草莓：躺在番茄旁边的小锥
      const berry = k.lathe({ name: 'berry', mat: 'sewing', segs: q(10, 8, 6), profile: profile([[0, 0], [0.008, 0.006, sm], [0.011, 0.016, sm], [0.008, 0.024, sm], [0, 0.026]]) });
      sw(berry, 'strawberry').transform(xf({ pos: [cx + 0.055, h + 0.0105, cz + 0.02], rot: [0, 0.7, Math.PI / 2] }));
      // 大头针：从针插表面斜着插进去，露出一截和珠头
      const rnd = k.rand('pins');
      for (let i = 0; i < 7; i++) {
        const a = (2 * Math.PI * i) / 7 + 0.3 * rnd(), el = 0.5 + 0.5 * rnd();
        const nrm = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)];
        const tip = [cx + nrm[0] * 0.022, h + 0.024 + nrm[1] * 0.018, cz + nrm[2] * 0.022];
        pin(k, `pin${i}`, tip, [nrm[0] + 0.3 * (rnd() - 0.5), nrm[1], nrm[2] + 0.3 * (rnd() - 0.5)], 0.03, i);
      }
    }

    // —— 裁缝剪 ——
    scissors(k, 'scissors', { place: xf({ pos: [0.19, h, 0.12], rot: [0, 0.5, 0] }) });
    // 一轴备用的线：倒在针插旁边
    spool(k, 'spare', { color: 1, place: xf({ pos: [0.42, h + 0.0158, 0.03], rot: [Math.PI / 2, 0.4, 0] }) });
  },
};
