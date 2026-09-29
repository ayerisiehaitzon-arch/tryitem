import { shape, rect, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { GAME_ATLAS, gameUV, gameSwatch } from '../materials/atlas.js';
import { sw, mapUV, ccw } from './parts.js';
import { tiltX } from '../gym2/parts.js';

// 街机：八十年代的立式机台，一台“STAR RAID”。
//   · 两块侧板是侧面轮廓（背后直的、顶灯箱往前伸、屏幕往后仰、控制台往外凸、下面是投币门）沿 x 挤出，
//     外面贴着侧板画（三道速度线、带环的大行星、星星、战机的剪影；两边是镜像的，画里没有字），
//     轮廓一圈橙红色的 T 形包边（扫掠，拐角斜接，底边不包）；
//   · 顶灯箱：背光的“STAR RAID”，整块自发光；下面一块往下斜的喇叭板，两只圆喇叭；
//   · 屏幕：黑玻璃的面框中间挖一个竖着的 3:4 的洞，显像管的画面缩在里面 1.8cm（洞口四周一圈黑色的内壁）：
//     一局正在打的太空射击 —— 编队、俯冲的敌机、爆炸、子弹、分数，带扫描线和弧面的暗角；
//   · 控制台往玩家那边斜 20°：面板上印着速度线和按键的圈，一根红球摇杆、三颗开火键（红黄蓝）、两颗白色的开始键；
//   · 下面是投币门（两个亮红灯的投币口、INSERT COIN、一把锁）和一块不锈钢的踢脚板。
// 原点在占地中心（地面上），正面朝 +z；只用游戏室图集一个材质
const W = 0.64, T = 0.019, IW = W - 2 * T;
// 侧面轮廓 (z, y)
const SIDE = [
  [-0.4, 0], [0.27, 0], [0.27, 0.86], [0.42, 0.92], [0.42, 1.0], [0.2, 1.08],
  [0.04, 1.5], [0.14, 1.56], [0.14, 1.735], [0.115, 1.76], [-0.4, 1.76],
];

export default {
  id: 'arcade_cabinet',
  name: '街机',
  nameEn: 'Upright Arcade Cabinet',
  category: 'game',
  aoDensity: 200,
  shadow: { margin: 0.2, maxDist: 0.5, density: 80 },
  view: { el: 10, az: 32 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const black = gameSwatch('black');
    const box = (name, size, place, swatch = 'black', o = {}) => sw(k.box({ name, mat: 'game', size, r: q(0.002, 0), segs: q(1, 0), xf: place, ...o }), swatch);
    // 一块沿侧面轮廓上两点之间的平板：局部 y 沿 a → b，局部 z 是朝外的法线（往机台外面）
    const slab = (name, a, b, thick, swatch = 'black', o = {}) => {
      const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy);
      const rot = tiltX(dy / L, dz / L), n = [0, -Math.sin(rot), Math.cos(rot)];
      const pos = [0, (a[1] + b[1]) / 2 - n[1] * thick / 2, (a[0] + b[0]) / 2 - n[2] * thick / 2];
      return box(name, [IW, L, thick], xf({ pos, rot: [rot, 0, 0] }), swatch, o);
    };

    // —— 两块侧板：轮廓挤出，外面贴侧板画，其余面是黑漆 ——
    {
      const sh = shape(ccw(SIDE.map(([z, y]) => [-z, y, {}])));
      const { w: SW, h: SH } = GAME_ATLAS.side;
      for (const s of [1, -1]) {
        const p = k.extrude({ name: `side${s > 0 ? 'R' : 'L'}`, mat: 'game', shape: sh, depth: T, axis: 'x', xf: xf({ pos: [s > 0 ? W / 2 - T : -W / 2, 0, 0] }) });
        mapUV(p, (v, n) => (n[0] * s > 0.7 ? gameUV('side', Math.min(1, Math.max(0, (v[2] + SW / 2) / SW)), Math.min(1, Math.max(0, (SH - v[1]) / SH))) : black));
        // T 形包边：沿轮廓（不包底边）扫一圈，一半露在板边外面
        const path = [...SIDE.slice(1), SIDE[0]].reverse().map(([z, y]) => [s * (W / 2 - T / 2), y, z]);
        sw(k.sweep({ name: `tmold${s > 0 ? 'R' : 'L'}`, mat: 'game', shape: rect(0.008, T + 0.003, { r: q(0.002, 0.0015, 0), segs: 1 }), path, up: [1, 0, 0], caps: [true, true] }), 'tmold');
      }
    }

    // —— 背板、顶板 ——
    box('back', [IW, 1.76, 0.012], xf({ pos: [0, 0.88, -0.394] }), 'black', { omit: ['ny'] });
    box('top', [IW, 0.012, 0.515], xf({ pos: [0, 1.754, -0.1425] }));

    // —— 顶灯箱：背光的画（自发光），上下两条黑色的压条 ——
    {
      const { w: MW, h: MH } = { w: 0.6, h: 0.15 };
      const yc = 1.65, zf = 0.136;
      const m = k.box({ name: 'marquee', mat: 'game', size: [MW, MH, 0.008], segs: 0, omit: ['nz'] });
      mapUV(m, (v, n) => (n[2] > 0.7 ? gameUV('marquee', (v[0] + MW / 2) / MW, (MH / 2 - v[1]) / MH) : black));
      m.transform(xf({ pos: [0, yc, zf - 0.004] }));
      box('marqueeTop', [IW, 0.012, 0.03], xf({ pos: [0, 1.731, 0.124] }));
      box('marqueeLow', [IW, 0.016, 0.03], xf({ pos: [0, 1.567, 0.124] }));
    }
    // —— 喇叭板（往下斜）和两只圆喇叭 ——
    {
      const a = [0.04, 1.5], b = [0.14, 1.56];
      slab('speakerPanel', a, b, 0.012, 'black');
      const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy);
      const rot = tiltX(dy / L, dz / L);
      // 喇叭：车削轴朝面板外法线（局部 z）
      for (const s of k.lod < 2 ? [1, -1] : []) {
        const P = xf({ pos: [s * 0.17, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2], rot: [rot + Math.PI / 2, 0, 0] });
        sw(k.lathe({ name: `speaker${s > 0 ? 'R' : 'L'}`, mat: 'game', segs: q(12, 8, 6), profile: profile([[0.034, -0.002], [0.034, 0.002, { r: 0.0015, segs: 1 }], [0.03, 0.0025], [0, 0.0005]]), xf: P }), 'grille');
      }
    }

    // —— 屏幕：黑玻璃面框中间一个 3:4 的洞，画面缩在里面 ——
    {
      const a = [0.2, 1.08], b = [0.04, 1.5];   // 面框从下往上
      const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy);
      const rot = tiltX(dy / L, dz / L);
      const BZ = xf({ pos: [0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2], rot: [rot, 0, 0] });
      const { w: SWd, h: SHt } = { w: 0.3, h: 0.4 }, t = 0.01, sink = 0.018;
      const side = (IW - SWd) / 2, cap = (L - SHt) / 2;
      const glass = (name, size, pos) => sw(k.box({ name, mat: 'game', size, segs: 0, omit: ['nz'], xf: BZ.mul(xf({ pos })) }), 'glass');
      for (const s of [1, -1]) {
        glass(`bezel${s > 0 ? 'R' : 'L'}`, [side, L, t], [s * (SWd / 2 + side / 2), 0, -t / 2]);
        glass(`bezel${s > 0 ? 'T' : 'B'}`, [SWd, cap, t], [0, s * (SHt / 2 + cap / 2), -t / 2]);
        // 洞口的内壁（黑）；远景不要
        if (k.lod < 2) box(`tunnel${s > 0 ? 'R' : 'L'}`, [0.002, SHt, sink], BZ.mul(xf({ pos: [s * (SWd / 2 + 0.001), 0, -sink / 2] })), 'black', { segs: 0 });
        if (k.lod < 2) box(`tunnel${s > 0 ? 'T' : 'B'}`, [SWd, 0.002, sink], BZ.mul(xf({ pos: [0, s * (SHt / 2 + 0.001), -sink / 2] })), 'black', { segs: 0 });
      }
      const scr = k.box({ name: 'screen', mat: 'game', size: [SWd, SHt, 0.001], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'] });
      mapUV(scr, (v) => gameUV('screen', (v[0] + SWd / 2) / SWd, (SHt / 2 - v[1]) / SHt));
      scr.transform(BZ.mul(xf({ pos: [0, 0, -sink] })));
    }

    // —— 控制台：往玩家那边斜 20° 的面板（印着速度线和按键的圈），前挡板、底下斜板 ——
    {
      const a = [0.2, 1.08], b = [0.42, 1.0];
      const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy);
      const rot = Math.atan2(-dy, dz);   // 面板法线（局部 y）往后仰 rot
      const th = 0.03;
      const CP = xf({ pos: [0, (a[1] + b[1]) / 2 - Math.cos(rot) * th / 2, (a[0] + b[0]) / 2 - Math.sin(rot) * th / 2], rot: [rot, 0, 0] });
      const panel = k.box({ name: 'cpanel', mat: 'game', size: [IW, th, L], r: q(0.003, 0), segs: q(1, 0) });
      mapUV(panel, (v, n) => (n[1] > 0.7 ? gameUV('cpanel', (v[0] + IW / 2) / IW, (v[2] + L / 2) / L) : black));
      panel.transform(CP);
      const at = (u, v) => CP.mul(xf({ pos: [-IW / 2 + u * IW, th / 2, -L / 2 + v * L] }));
      // 摇杆：防尘圈、钢杆、红球
      sw(k.lathe({ name: 'stickWasher', mat: 'game', segs: q(14, 8, 6), profile: profile([[0.028, 0], [0.028, 0.003, { r: 0.0015, segs: 1 }], [0.006, 0.004]]), xf: at(0.2, 0.55) }), 'black');
      sw(k.lathe({ name: 'stickShaft', mat: 'game', segs: q(8, 6, 4), profile: profile([[0.0055, 0.003], [0.0055, 0.058]]), xf: at(0.2, 0.55) }), 'chrome');
      sw(k.lathe({
        name: 'stickBall', mat: 'game', segs: q(14, 10, 6), xf: at(0.2, 0.55),
        profile: profile([[0, 0.052], [0.012, 0.056, sm], [0.0185, 0.07, sm], [0.012, 0.084, sm], [0, 0.088]]),
      }), 'btnRed');
      // 开火键（红、黄、蓝）和两颗开始键
      const button = (name, u, v, r, color) => {
        if (k.lod < 2) sw(k.lathe({ name: `${name}Ring`, mat: 'game', segs: q(12, 8, 6), profile: profile([[r + 0.004, 0], [r + 0.004, 0.003, { r: 0.0015, segs: 1 }], [r, 0.004]]), xf: at(u, v) }), 'black');
        sw(k.lathe({ name, mat: 'game', segs: q(12, 8, 6), profile: profile([[r, 0.003], [r, 0.009, { r: 0.002, segs: 1 }], [r * 0.6, 0.008, sm], [0, 0.0075]]), xf: at(u, v) }), color);
      };
      button('fireA', 0.56, 0.55, 0.0135, 'btnRed');
      button('fireB', 0.68, 0.55, 0.0135, 'btnYellow');
      button('fireC', 0.8, 0.55, 0.0135, 'btnBlue');
      button('start1', 0.42, 0.22, 0.01, 'white');
      button('start2', 0.54, 0.22, 0.01, 'white');
      box('cpFront', [IW, 0.075, 0.016], xf({ pos: [0, 0.955, 0.412] }));
      slab('cpUnder', [0.27, 0.86], [0.42, 0.92], 0.012, 'black', { omit: [] });
    }

    // —— 下面：黑色的面板、投币门、不锈钢踢脚板 ——
    box('front', [IW, 0.76, 0.012], xf({ pos: [0, 0.48, 0.264] }));
    {
      const { w: CW, h: CH } = GAME_ATLAS.coin;
      const door = k.box({ name: 'coinDoor', mat: 'game', size: [CW, CH, 0.01], r: q(0.003, 0), segs: q(1, 0), omit: ['nz'] });
      mapUV(door, (v, n) => (n[2] > 0.7 ? gameUV('coin', (v[0] + CW / 2) / CW, (CH / 2 - v[1]) / CH) : gameSwatch('steel')));
      door.transform(xf({ pos: [0, 0.56, 0.275] }));
    }
    box('kick', [IW, 0.1, 0.012], xf({ pos: [0, 0.05, 0.27] }), 'steel', { omit: ['ny', 'nz'] });
  },
};
