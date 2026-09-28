import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { theaterUV, THEATER_ATLAS } from '../materials/atlas.js';
import { sw, mapUV, ccw } from './parts.js';

// 投影幕 + 影音柜 + 激光投影仪：贴墙的一组（原点在墙根，z = 0 是墙面，朝 +z）。
//   · 100 寸 16:9 画框幕：画面 2.214 × 1.245m，四周 7.5cm 宽的黑丝绒边框（截面沿闭合路径扫一圈：正面平、外沿圆、
//     朝画面一侧一道吸光的斜面），离墙 3cm 挂着；幕布是一块平面，整幅映射到图集里的电影画面：
//     黄昏的山湖、桥上两个人的背影，上下是 2.39:1 宽银幕的黑边。画面自发光，颜色图压暗（屋里的灯不会把画面冲白）；
//   · 影音柜悬挂在画面下方：2m 长的胡桃木柜，左右两扇竖条纹（凹凸的半圆竖棱）的推开门，中间一格开放的格子
//     里放着功放（拉丝铝面板、黑玻璃屏上亮着音量，两个旋钮）和几张蓝光碟；
//   · 柜子上正中一台超短焦激光投影仪：白色机身，正面一块深灰针织网布，顶上靠墙一块黑玻璃（镜头在底下），顶面前沿印着字。
export const SCREEN = { vw: 2.214, vh: 1.245, frame: 0.075, depth: 0.045, off: 0.03, y0: 0.74 };
const CON = { w: 2.0, d: 0.42, y0: 0.16, h: 0.36, z0: 0.03, t: 0.025 };

export default {
  id: 'projector_screen',
  name: '投影幕',
  nameEn: 'Fixed-Frame Projection Screen',
  category: 'theater',
  planes: ['floor', 'wall'],
  aoDensity: 90,
  shadow: {
    floor: { margin: 0.2, maxDist: 0.6, density: 50 },
    wall: { margin: 0.12, maxDist: 0.35, density: 50, strength: 0.6 },
  },
  view: { el: 8, az: 18 },
  build(k) {
    const q = (...v) => k.q(...v);
    const { vw, vh, frame: fw, depth: fd, off, y0 } = SCREEN;
    const yc = y0 + vh / 2;

    // —— 画框：截面 x 朝画面里（R = U × T：从正面看逆时针走的路径，R 指向框内），y 朝屋里 ——
    {
      const prof = shape([
        [-fw / 2, 0], [fw / 2, 0], [fw / 2, 0.012, { r: q(0.002, 0), segs: 1 }],
        [fw / 2 - 0.022, fd, { r: q(0.003, 0.002, 0), segs: 1 }], [-fw / 2, fd, { r: q(0.007, 0.005, 0), segs: q(3, 2, 1) }],
      ]);
      const hx = vw / 2 + fw / 2, hy = vh / 2 + fw / 2, z = off;
      sw(k.sweep({
        name: 'frame', mat: 'theater', shape: prof, closed: true, caps: [false, false], up: [0, 0, 1],
        path: [[-hx, yc - hy, z], [hx, yc - hy, z], [hx, yc + hy, z], [-hx, yc + hy, z]],
      }), 'velvetBlack');
    }
    // —— 幕布：整幅映射到电影画面（四周多出的 5mm 压在边框底下）——
    {
      const e = 0.005;
      const part = k.box({ name: 'screen', mat: 'theater', size: [vw + 2 * e, vh + 2 * e, 0.001], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'], xf: xf({ pos: [0, yc, off + 0.012] }) });
      mapUV(part, (p) => theaterUV('film', (p[0] + vw / 2) / vw, (y0 + vh - p[1]) / vh));
    }

    // —— 影音柜：柜体（顶、底、两侧、背板、两块竖隔板）——
    const { w: W, d: D, y0: Y0, h: H, z0: Z0, t: T } = CON;
    const ZC = Z0 + D / 2, YT = Y0 + H;
    const wood = (name, size, pos, o = {}) => k.box({ name, mat: 'walnut', size, r: q(0.003, 0.002, 0), segs: q(1, 1, 0), xf: xf({ pos }), ...o });
    wood('top', [W, T, D], [0, YT - T / 2, ZC], { grain: 'x', r: q(0.004, 0.003, 0), segs: q(2, 1, 0) });
    wood('bottom', [W, T, D], [0, Y0 + T / 2, ZC], { grain: 'x' });
    for (const s of [-1, 1]) wood(`side${s > 0 ? 'R' : 'L'}`, [T, H - 2 * T, D], [s * (W / 2 - T / 2), Y0 + H / 2, ZC], { grain: 'y', segs: 0 });
    wood('back', [W - 2 * T, H - 2 * T, 0.01], [0, Y0 + H / 2, Z0 + 0.005], { grain: 'x', segs: 0, omit: ['nz'] });
    const XD = 0.35;
    for (const s of [-1, 1]) wood(`divider${s > 0 ? 'R' : 'L'}`, [0.02, H - 2 * T, D - 0.01], [s * XD, Y0 + H / 2, ZC + 0.005], { grain: 'y', segs: 0 });

    // —— 两扇竖条纹门：截面前面一排半圆的竖棱（棱与棱之间是硬折角），沿高度挤出 ——
    {
      const g = 0.002, dh = H - 2 * T - 2 * g, dt = 0.022, rh = 0.006;
      const x0 = XD + 0.01 + g, x1 = W / 2 - T - g, dw = x1 - x0;
      const nr = 26, pitch = dw / nr, sr = q(4, 2, 1);
      const pts = [[-dw / 2, dt / 2], [dw / 2, dt / 2]];
      // 前面（z 大的一侧）从右往左：一条条竖棱
      for (let i = nr - 1; i >= 0; i--) {
        for (let j = sr; j >= (i === 0 ? 0 : 1); j--) {
          const th = (Math.PI * j) / sr;
          const x = -dw / 2 + (i + (1 - Math.cos(th)) / 2) * pitch;
          const z = dt / 2 - rh + rh * Math.sin(th);
          pts.push([x, -z, j === 0 || j === sr ? {} : { smooth: true }]);
        }
      }
      // 挤出轴 'y' 的截面坐标是 (x, -z)：上面的点已经按这个写好（背面 z = -dt/2 → y = dt/2）
      const sh = shape(ccw(pts));
      for (const s of [-1, 1]) {
        k.extrude({
          name: `door${s > 0 ? 'R' : 'L'}`, mat: 'walnut', shape: sh, depth: dh, axis: 'y', caps: [false, false], grain: 'len',
          xf: xf({ pos: [s * (x0 + dw / 2), Y0 + T + g, Z0 + D - dt / 2 - 0.001] }),
        });
      }
    }

    // —— 功放：黑色机身、拉丝铝面板（图集）、两个铝旋钮、四只脚 ——
    {
      const bw = 0.43, bh = 0.15, bd = 0.34, by = Y0 + T + 0.008, bz = Z0 + D - 0.035 - bd / 2;
      sw(k.box({ name: 'avr', mat: 'theater', size: [bw, bh, bd], r: q(0.004, 0.003, 0), segs: q(1, 1, 0), omit: ['ny'], xf: xf({ pos: [0, by + bh / 2, bz] }) }), 'satinBlack');
      const { w: PW, h: PH } = THEATER_ATLAS.receiver;
      const ptop = by + bh - 0.004, pz = bz + bd / 2 + 0.003;
      const panel = k.box({ name: 'avrPanel', mat: 'theater', size: [PW, PH, 0.006], segs: 0, omit: ['nz'], xf: xf({ pos: [0, ptop - PH / 2, pz] }) });
      mapUV(panel, (p, n) => (n[2] > 0.7 ? theaterUV('receiver', (p[0] + PW / 2) / PW, (ptop - p[1]) / PH) : theaterUV('receiver', 0.5, 0.01)));
      for (const [i, [px, r]] of [[0.058, 0.026], [0.372, 0.033]].entries()) {
        sw(k.lathe({
          name: `knob${i}`, mat: 'theater', segs: q(16, 10, 6),
          profile: profile([[r, 0], [r, 0.017, { r: 0.002, segs: 1 }], [r - 0.004, 0.02], [0, 0.0192]]),
          xf: xf({ pos: [-PW / 2 + px, ptop - 0.07, pz + 0.003], rot: [Math.PI / 2, 0, 0] }),
        }), 'aluminum');
      }
      // 几张蓝光碟：立在格子左边，书脊朝外
      for (let i = 0; i < 4; i++) {
        sw(k.box({ name: `disc${i}`, mat: 'theater', size: [0.0135, 0.17, 0.135], r: q(0.0015, 0), segs: q(1, 0), omit: ['ny'], xf: xf({ pos: [-XD + 0.035 + i * 0.0145, Y0 + T + 0.085, ZC + 0.07], rot: [0, 0, i === 3 ? -0.12 : 0] }) }), 'disc');
      }
    }

    // —— 超短焦激光投影仪 ——
    {
      const pw = 0.56, ph = 0.11, pd = 0.34, py = YT + 0.004, pz = Z0 + 0.03 + pd / 2;
      sw(k.box({ name: 'projector', mat: 'theater', size: [pw, ph, pd], r: q(0.014, 0.01, 0.006), segs: q(3, 2, 1), omit: ['ny'], xf: xf({ pos: [0, py + ph / 2, pz] }) }), 'projWhite');
      const { w: FW, h: FH } = THEATER_ATLAS.fabric;
      const fy = py + 0.012, fz = pz + pd / 2 + 0.001;
      const fab = k.box({ name: 'grille', mat: 'theater', size: [FW - 0.03, FH - 0.018, 0.004], r: q(0.002, 0), segs: q(1, 0), omit: ['nz'], xf: xf({ pos: [0, fy + (FH - 0.018) / 2, fz] }) });
      mapUV(fab, (p) => theaterUV('fabric', (p[0] + FW / 2) / FW, (fy + FH - p[1]) / FH));
      sw(k.box({ name: 'window', mat: 'theater', size: [0.36, 0.004, 0.1], r: q(0.002, 0), segs: q(1, 0), omit: ['ny'], xf: xf({ pos: [0, py + ph, pz - pd / 2 + 0.07] }) }), 'glassBlack');
      const { w: LW, h: LH } = THEATER_ATLAS.badgeW;
      const lz = pz + pd / 2 - 0.035;
      const logo = k.box({ name: 'logo', mat: 'theater', size: [LW, 0.0006, LH], segs: 0, omit: ['px', 'nx', 'ny', 'pz', 'nz'], xf: xf({ pos: [0, py + ph + 0.0003, lz] }) });
      mapUV(logo, (p) => theaterUV('badgeW', (p[0] + LW / 2) / LW, (p[2] - (lz - LH / 2)) / LH));
      for (const [i, [sx, sz]] of [[-1, -1], [1, -1], [-1, 1], [1, 1]].entries()) {
        sw(k.box({ name: `foot${i}`, mat: 'theater', size: [0.03, 0.004, 0.03], segs: 0, omit: ['ny', 'py'], xf: xf({ pos: [sx * (pw / 2 - 0.05), py - 0.002, pz + sz * (pd / 2 - 0.05)] }) }), 'rubber');
      }
    }
  },
};
