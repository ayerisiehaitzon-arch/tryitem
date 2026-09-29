import { shape, profile, rect, circle } from '../core/shape.js';
import { xf, norm, cross } from '../core/vec.js';
import { PET_ATLAS, petUV } from '../materials/atlas.js';
import { ANGEL } from './shapes.js';
import { sw, mapUV, rod, frame, ccw, catmull } from './parts.js';

// 水草鱼缸：胡桃木的鱼缸柜（两扇门、黑色的细拉手）上面一个 90cm 的玻璃缸（黑色的上下框），缸顶架着一条 LED 灯。
//   · 后玻璃外面贴着蓝绿渐变的背景膜；底砂前低后高；左后方一截沉木（主干加两根枝杈，枝上绑着铁皇冠），几块石头；
//   · 后面两个角一丛丛苦草（长长的飘带，长到水面再顺着水面弯过去），中景两棵皇冠草（一圈拱起来的长叶），
//     前景几撮牛毛草；
//   · 一群红绿灯鱼（蓝色的发光条纹）在中间游，两条神仙鱼（四道黑竖纹、长长的背鳍臀鳍），两条鼠鱼趴在底砂上；
//   · 右后角的气石冒出一串气泡，后面一个黑色的过滤器、一根加热棒；水面是一层半透明的水。
// 原点在柜子正下方的地面，正面朝 +z。
const CAB = { w: 0.92, h: 0.72, d: 0.42, top: 0.03 };
const TANK = { w: 0.9, h: 0.45, d: 0.4, g: 0.006, y0: CAB.h + CAB.top };
const IN = { x: TANK.w / 2 - TANK.g, z: TANK.d / 2 - TANK.g };
const WATER = TANK.y0 + TANK.h - 0.025;
// 底砂表面的高度（前低后高，z 从 +IN.z 到 -IN.z）
const SAND = (z) => TANK.y0 + TANK.g + 0.04 + 0.066 * ((IN.z - z) / (2 * IN.z)) ** 1.2;

export default {
  id: 'aquarium',
  name: '水草鱼缸',
  nameEn: 'Planted Aquarium on Cabinet',
  category: 'pets',
  aoDensity: 300,
  shadow: { margin: 0.12, maxDist: 0.7, density: 110 },
  view: { el: 10, az: 18 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const rnd = k.rand('aquarium');

    // —— 柜子 ——
    {
      const { w, h, d } = CAB;
      k.box({ name: 'cabinet', mat: 'walnut', size: [w, h - 0.06, d], r: 0.003, segs: q(1, 1, 0), omit: ['ny'], grain: 'x', xf: xf({ pos: [0, 0.06 + (h - 0.06) / 2, 0] }) });
      k.box({ name: 'plinth', mat: 'walnut', size: [w - 0.04, 0.06, d - 0.04], segs: 0, omit: ['ny', 'py'], grain: 'x', xf: xf({ pos: [0, 0.03, -0.01] }) });
      k.box({ name: 'cabTop', mat: 'walnut', size: [w + 0.02, CAB.top, d + 0.02], r: 0.003, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [0, h + CAB.top / 2, 0] }) });
      for (const s of [-1, 1]) {
        const dw = w / 2 - 0.012;
        k.box({ name: `door${s > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [dw, h - 0.1, 0.018], r: 0.002, segs: q(1, 1, 0), grain: 'y', omit: ['nz'], xf: xf({ pos: [s * (dw / 2 + 0.003), 0.06 + (h - 0.06) / 2, d / 2 + 0.009] }) });
        sw(k.box({ name: `handle${s > 0 ? 'R' : 'L'}`, mat: 'pet', size: [0.012, 0.16, 0.014], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), xf: xf({ pos: [s * 0.035, CAB.h - 0.16, d / 2 + 0.025] }) }), 'black');
      }
    }

    // —— 玻璃缸、上下黑框、背景膜 ——
    const y0 = TANK.y0, y1 = y0 + TANK.h, yc = (y0 + y1) / 2, { g } = TANK;
    {
      const pane = (name, size, pos) => k.box({ name, mat: 'aqua_glass', size, segs: 0, xf: xf({ pos }) });
      pane('glassFront', [TANK.w, TANK.h, g], [0, yc, TANK.d / 2 - g / 2]);
      pane('glassBack', [TANK.w, TANK.h, g], [0, yc, -TANK.d / 2 + g / 2]);
      for (const s of [-1, 1]) pane(`glassSide${s > 0 ? 'R' : 'L'}`, [g, TANK.h, TANK.d - 2 * g], [s * (TANK.w / 2 - g / 2), yc, 0]);
      sw(k.box({ name: 'glassBottom', mat: 'pet', size: [TANK.w - 2 * g, g, TANK.d - 2 * g], segs: 0, omit: ['ny'], xf: xf({ pos: [0, y0 + g / 2, 0] }) }), 'silicone');
      // 上下各一圈黑框（压在玻璃边上）
      for (const [tag, y] of [['Top', y1 - 0.007], ['Bot', y0 + 0.009]]) {
        const fh = tag === 'Top' ? 0.014 : 0.018, fw = 0.016;
        for (const s of [-1, 1]) {
          sw(k.box({ name: `frame${tag}${s > 0 ? 'F' : 'B'}`, mat: 'pet', size: [TANK.w + 0.004, fh, fw], r: q(0.002, 0.001, 0), segs: q(1, 1, 0), xf: xf({ pos: [0, y, s * (TANK.d / 2 - fw / 2 + 0.002)] }) }), 'frameBlack');
          sw(k.box({ name: `frame${tag}${s > 0 ? 'R' : 'L'}`, mat: 'pet', size: [fw, fh, TANK.d - 2 * fw + 0.004], r: q(0.002, 0.001, 0), segs: q(1, 1, 0), xf: xf({ pos: [s * (TANK.w / 2 - fw / 2 + 0.002), y, 0] }) }), 'frameBlack');
        }
      }
      const bg = k.box({ name: 'background', mat: 'pet', size: [TANK.w - 0.01, TANK.h - 0.03, 0.002], segs: 0, omit: ['nz'] });
      const B = PET_ATLAS.tankBack;
      mapUV(bg, (p) => petUV('tankBack', (p[0] + B.w / 2) / B.w, (B.h / 2 - p[1]) / B.h));
      bg.transform(xf({ pos: [0, yc + 0.005, -TANK.d / 2 - 0.0012] }));
      // 水面
      k.box({ name: 'water', mat: 'water', size: [2 * IN.x, 0.003, 2 * IN.z], segs: 0, omit: ['ny'], xf: xf({ pos: [0, WATER - 0.0015, 0] }) });
    }

    // —— 底砂：前低后高，沿 x 挤出的截面 ——
    {
      const n = q(8, 5, 3), pts = [];
      for (let i = 0; i <= n; i++) {
        const z = IN.z - (2 * IN.z * i) / n;
        pts.push([-z, SAND(z), i > 0 && i < n ? sm : {}]);
      }
      pts.push([IN.z, y0 + g], [-IN.z, y0 + g]);
      k.extrude({ name: 'gravel', mat: 'gravel', shape: shape(ccw(pts)), depth: 2 * IN.x, axis: 'x', center: true, grain: 'across' });
    }

    // —— 沉木：主干从左后方的底砂里斜着伸出来，两根枝杈 ——
    const wood = [
      { pts: [[-0.34, SAND(-0.14) - 0.01, -0.14], [-0.24, 0.9, -0.1], [-0.12, 0.96, -0.07], [-0.02, 1.04, -0.06], [0.04, 1.08, -0.09]], r: [0.022, 0.006] },
      { pts: [[-0.2, 0.88, -0.1], [-0.2, 0.97, -0.13], [-0.25, 1.06, -0.15]], r: [0.012, 0.004] },
      { pts: [[-0.08, 0.98, -0.07], [-0.02, 0.97, -0.01], [0.05, 0.99, 0.03]], r: [0.01, 0.004] },
    ];
    wood.forEach((b, i) => {
      const path = catmull(b.pts, q(4, 3, 2));
      sw(k.sweep({ name: `wood${i}`, mat: 'pet', shape: circle(1, q(9, 7, 5)), path, up: [0, 0, 1], scale: (t) => b.r[0] + (b.r[1] - b.r[0]) * t ** 0.8 }), i ? 'driftwoodDark' : 'driftwood');
    });
    // 石头：车削的圆包，再用正弦扭得不规则
    [[0.19, 0.02, 0.05, 0.065, 'stoneA'], [0.31, -0.07, 0.036, 0.05, 'stoneB'], [-0.06, 0.07, 0.026, 0.03, 'stoneC']].forEach(([x, z, r, h, c], i) => {
      const st = k.lathe({ name: `stone${i}`, mat: 'pet', segs: q(10, 8, 6), profile: profile([[r, -0.01], [r * 1.02, h * 0.3, sm], [r * 0.8, h * 0.75, sm], [r * 0.35, h * 0.98, sm], [0, h]]) });
      st.deform(([px, py, pz]) => { const a = Math.atan2(pz, px), f = 1 + 0.18 * Math.sin(3 * a + i) + 0.1 * Math.sin(5 * a + 2 * i); return [px * f * 1.15, py * (1 + 0.1 * Math.sin(2 * a)), pz * f * 0.85]; });
      sw(st, c).transform(xf({ pos: [x, SAND(z) - 0.004, z], rot: [0, i * 1.3, 0] }));
    });

    // —— 苦草：后面两个角的一丛丛长飘带，长到水面顺着水面弯过去 ——
    {
      const n = q(26, 16, 8);
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0;
        const x = left ? -0.42 + 0.2 * rnd() : 0.22 + 0.2 * rnd(), z = -0.17 + 0.07 * rnd();
        const yb = SAND(z) - 0.005, H = WATER - yb - 0.01 - 0.06 * rnd();
        const bend = (left ? 1 : -1) * (0.04 + 0.08 * rnd()), sway = 0.02 * (rnd() - 0.5), ph = rnd() * 6;
        const m = q(8, 5, 3), path = [];
        for (let j = 0; j <= m; j++) {
          const f = j / m, top = Math.max(0, (f - 0.78) / 0.22);
          path.push([x + sway * Math.sin(f * 4 + ph) + bend * top * top, yb + H * f - 0.02 * top * top, z + 0.01 * Math.sin(f * 3 + ph)]);
        }
        sw(k.sweep({ name: `vallis${i}`, mat: 'pet', shape: rect(0.0075, 0.0007), path, up: [0, 0, 1], scale: (t) => (t > 0.9 ? 1 - (t - 0.9) * 6 : 1) }), i % 3 ? 'vallis' : 'vallisDark');
      }
    }
    // —— 皇冠草：一圈拱起来的长叶（叶柄细、叶片中间宽、叶尖尖）——
    const rosette = (name, cx, cz, count, L, W, color) => {
      for (let i = 0; i < count; i++) {
        const a = (2 * Math.PI * i) / count + 0.4 * rnd(), l = L * (0.75 + 0.35 * rnd()), rise = 0.65 + 0.3 * rnd();
        const dir = [Math.cos(a), 0, Math.sin(a)], yb = SAND(cz) - 0.004;
        const m = q(8, 5, 3), path = [];
        for (let j = 0; j <= m; j++) {
          const f = j / m, out = l * (0.15 * f + 0.55 * f * f), up = l * rise * Math.sin(f * 1.9) * 0.8;
          path.push([cx + dir[0] * out, yb + up, cz + dir[2] * out]);
        }
        const wprof = (t) => Math.max(0.08, t < 0.25 ? 0.12 + t * 0.6 : Math.sin(Math.PI * Math.min(1, (t - 0.1) / 0.9)) ** 0.7);
        sw(k.sweep({ name: `${name}${i}`, mat: 'pet', shape: rect(W, 0.0012), path, up: dir, scale: wprof }), i % 3 === 0 ? color[1] : color[0]);
      }
    };
    rosette('swordA', 0.1, -0.06, q(9, 7, 5), 0.2, 0.03, ['sword', 'swordLight']);
    rosette('swordB', 0.3, 0.05, q(7, 5, 4), 0.14, 0.024, ['swordLight', 'sword']);
    // 铁皇冠：绑在沉木上，几片深绿的窄叶
    {
      const base = [-0.12, 0.97, -0.075];
      for (let i = 0; i < q(7, 5, 3); i++) {
        const a = -0.6 + i * 0.5 + 0.2 * rnd(), l = 0.08 + 0.05 * rnd();
        const dir = [Math.cos(a), 0, Math.sin(a) * 0.6 - 0.3];
        const path = [0, 0.33, 0.66, 1].map((f) => [base[0] + dir[0] * l * f, base[1] + l * (0.9 * f - 0.55 * f * f), base[2] + dir[2] * l * f]);
        sw(k.sweep({ name: `fern${i}`, mat: 'pet', shape: rect(0.013, 0.001), path, up: [0, 1, 0], scale: (t) => Math.max(0.1, Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) ** 0.6) }), 'fern');
      }
    }
    // 牛毛草：前景几撮细草
    if (k.lod < 2) {
      [[-0.3, 0.12], [-0.18, 0.15], [0.02, 0.14], [0.16, 0.16], [0.36, 0.13]].forEach(([cx, cz], t) => {
        for (let i = 0; i < q(9, 5); i++) {
          const a = rnd() * 2 * Math.PI, r0 = 0.012 * rnd(), h = 0.035 + 0.03 * rnd(), lean = 0.012 * rnd();
          const bx = cx + r0 * Math.cos(a), bz = cz + r0 * Math.sin(a), yb = SAND(bz) - 0.003;
          const path = [[bx, yb, bz], [bx + lean * Math.cos(a) * 0.4, yb + h * 0.55, bz + lean * Math.sin(a) * 0.4], [bx + lean * Math.cos(a), yb + h, bz + lean * Math.sin(a)]];
          sw(k.sweep({ name: `grass${t}_${i}`, mat: 'pet', shape: rect(0.0016, 0.0006), path, up: [0, 0, 1], scale: (s) => 1 - 0.85 * s }), 'grass');
        }
      });
    }

    // —— 鱼 ——
    const school = [[-0.2, 1.02, 0.02, 0.1], [-0.16, 1.05, -0.02, 0.15], [-0.13, 1.0, 0.06, -0.05], [-0.09, 1.04, 0.03, 0.2], [-0.24, 1.07, 0.05, 0.05],
      [-0.06, 1.01, -0.01, 0.12], [-0.18, 0.98, 0.09, -0.1], [-0.11, 1.08, 0.08, 0.3], [-0.03, 1.06, 0.05, 0.18], [-0.27, 1.0, -0.03, 0.0], [-0.14, 1.11, 0.0, 0.25]];
    school.forEach(([x, y, z, yaw], i) => {
      if (k.lod === 2 && i % 2) return;
      lathFish(k, `neon${i}`, { L: 0.03, prof: [[0, 0], [0.0011, 0.002], [0.0021, 0.008], [0.0041, 0.017], [0.0037, 0.024], [0.0021, 0.0285], [0, 0.03]], region: 'neon', H: 0.009, flat: 0.62, fin: 'fin', at: [x, y, z], yaw, pitch: 0.06 * Math.sin(i) });
    });
    angelfish(k, 'angelA', [0.16, 1.03, 0.03], Math.PI - 0.25);
    angelfish(k, 'angelB', [-0.31, 0.98, -0.02], 0.35);
    lathFish(k, 'coryA', { L: 0.045, prof: [[0, 0], [0.0024, 0.004], [0.004, 0.012], [0.0074, 0.028], [0.0072, 0.037], [0.0042, 0.044], [0, 0.046]], region: 'cory', H: 0.014, flat: 0.72, belly: 0.55, fin: 'fin', dorsal: true, at: [-0.05, SAND(0.15) + 0.0045, 0.15], yaw: 0.4, pitch: 0 });
    lathFish(k, 'coryB', { L: 0.042, prof: [[0, 0], [0.0024, 0.004], [0.004, 0.012], [0.007, 0.027], [0.0068, 0.035], [0.004, 0.041], [0, 0.043]], region: 'cory', H: 0.014, flat: 0.72, belly: 0.55, fin: 'fin', dorsal: true, at: [0.24, SAND(0.12) + 0.0042, 0.12], yaw: 2.6, pitch: 0 });

    // —— 过滤器、加热棒、气石和一串气泡 ——
    sw(k.box({ name: 'filter', mat: 'pet', size: [0.05, 0.26, 0.045], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), xf: xf({ pos: [IN.x - 0.03, SAND(-0.17) + 0.13, -IN.z + 0.028] }) }), 'frameBlack');
    sw(k.box({ name: 'filterOut', mat: 'pet', size: [0.03, 0.012, 0.04], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [IN.x - 0.05, WATER - 0.02, -IN.z + 0.05] }) }), 'frameBlack');
    {
      const a = [-IN.x + 0.03, SAND(-0.17) + 0.02, -IN.z + 0.025], b = [-IN.x + 0.05, WATER - 0.01, -IN.z + 0.025];
      rod(k, 'heater', a, b, 0.011, 'heater', { segs: q(10, 8, 6) });
      rod(k, 'heaterCap', b, [b[0] + 0.004, b[1] + 0.03, b[2]], 0.012, 'black', { segs: q(10, 8, 6) });
    }
    {
      const sx = 0.33, sz = -0.12, sy = SAND(sz);
      sw(k.lathe({ name: 'airStone', mat: 'pet', segs: q(10, 8, 6), profile: profile([[0.012, 0], [0.012, 0.012, sm], [0, 0.014]]), xf: xf({ pos: [sx, sy - 0.003, sz] }) }), 'stoneC');
      rod(k, 'airLine', [sx + 0.008, sy + 0.008, sz], [sx + 0.03, WATER + 0.02, -IN.z + 0.004], 0.0022, 'silicone', { segs: q(6, 4, 3) });
      const nb = q(16, 10, 6);
      for (let i = 0; i < nb; i++) {
        const f = i / (nb - 1), y = sy + 0.03 + (WATER - sy - 0.05) * f ** 0.9, r = 0.0022 + 0.002 * f + 0.001 * rnd();
        sw(k.lathe({ name: `bubble${i}`, mat: 'pet', segs: 6, profile: profile([[0, -r], [r, 0, sm], [0, r]]), xf: xf({ pos: [sx + 0.012 * Math.sin(f * 9), y, sz + 0.01 * Math.cos(f * 7)] }) }), 'bubble');
      }
    }

    // —— 缸顶的 LED 灯：一条黑色的铝壳，底面发光，两头的支脚搭在侧玻璃上 ——
    {
      const ly = y1 + 0.03;
      sw(k.box({ name: 'lamp', mat: 'pet', size: [TANK.w + 0.06, 0.012, 0.085], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), omit: ['ny'], xf: xf({ pos: [0, ly, -0.03] }) }), 'frameBlack');
      sw(k.box({ name: 'lampLed', mat: 'pet', size: [TANK.w - 0.04, 0.002, 0.06], segs: 0, omit: ['py'], xf: xf({ pos: [0, ly - 0.006, -0.03] }) }), 'led');
      for (const s of [-1, 1]) sw(k.box({ name: `lampLeg${s > 0 ? 'R' : 'L'}`, mat: 'pet', size: [0.012, 0.03, 0.05], r: q(0.002, 0), segs: q(1, 0), xf: xf({ pos: [s * (TANK.w / 2 + 0.01), y1 + 0.012, -0.03] }) }), 'frameBlack');
    }
  },
};

// 车削的小鱼（红绿灯、鼠鱼）：沿局部 y（从尾到嘴）车削，侧扁（z 压扁）、肚子可以压平；侧面按图集的一格平面贴（u 沿鱼身、v 从背到肚子）；
// 一片分叉的尾鳍，鼠鱼再加一片背鳍。at 是鱼身中心，yaw 是游的方向（绕 y，0 = 朝 +x），pitch 抬头
function lathFish(k, name, { L, prof, region, H, flat, belly = 1, fin, dorsal = false, at, yaw, pitch }) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const body = k.lathe({ name, mat: 'pet', segs: q(10, 7, 5), profile: profile(prof.map(([r, y], i) => [r, y, i > 0 && i < prof.length - 1 ? sm : {}])) });
  // 车削出来的 x 当作鱼的“上”，z 是侧面
  body.deform(([x, y, z]) => [x < 0 ? x * belly : x, y, z * flat]);
  const top = Math.max(...prof.map((p) => p[0]));
  mapUV(body, (p) => petUV(region, p[1] / L, Math.min(1, Math.max(0, (top - p[0]) / (2 * top)))));
  const fwd = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.sin(yaw) * Math.cos(pitch)];
  const up0 = [0, 1, 0], upx = norm(cross(cross(fwd, up0), fwd));
  const side = cross(upx, fwd);
  const F = frame(upx, fwd, side, [at[0] - fwd[0] * L / 2, at[1] - fwd[1] * L / 2, at[2] - fwd[2] * L / 2]);
  body.transform(F);
  // 尾鳍：鱼尾后面一片分叉的薄片（在“上 × 前”的平面里）
  const tail = [[0, 0.0005], [0.36 * L * 0.35, -0.2 * L], [0, -0.16 * L], [-0.36 * L * 0.35, -0.2 * L], [0, 0.0005]].slice(0, 4);
  sw(k.extrude({ name: `${name}Tail`, mat: 'pet', shape: shape(ccw(tail)), depth: 0.0005, center: true, xf: F }), fin);
  if (dorsal) sw(k.extrude({ name: `${name}Dorsal`, mat: 'pet', shape: shape(ccw([[top * 0.9, 0.5 * L], [top * 0.9 + 0.012, 0.55 * L], [top * 0.9, 0.7 * L]])), depth: 0.0006, center: true, xf: F }), fin);
}

// 神仙鱼：身子是 ANGEL 轮廓挤出（四周倒圆），背鳍、臀鳍、尾鳍是薄片，腹鳍两根长丝；整条鱼按同一张侧面贴图平面贴
function angelfish(k, name, at, yaw) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const Z = PET_ATLAS.angel.size;
  const uv = (p) => petUV('angel', (p[0] + Z / 2) / Z, (Z / 2 - p[1]) / Z);
  const F = xf({ pos: at, rot: [0, yaw, 0] });
  const body = k.extrude({ name: `${name}Body`, mat: 'pet', shape: shape(ANGEL.body(q(4, 3, 2)).map(([x, y]) => [x, y, sm])), depth: ANGEL.thick, center: true, bevel: { w: 0.004, h: 0.0045 }, bsegs: q(2, 1, 1) });
  mapUV(body, uv).transform(F);
  for (const fin of ['dorsal', 'anal', 'tail']) {
    const p = k.extrude({ name: `${name}${fin}`, mat: 'pet', shape: shape(ccw(ANGEL[fin])), depth: 0.0012, center: true });
    mapUV(p, uv).transform(F);
  }
  if (k.lod < 2) {
    for (const s of [-1, 1]) {
      const path = catmull([[0.006, -0.018, s * 0.002], [0.0, -0.035, s * 0.004], [-0.012, -0.062, s * 0.006]], q(3, 2));
      sw(k.sweep({ name: `${name}Thread${s > 0 ? 'R' : 'L'}`, mat: 'pet', shape: circle(0.0005, 4), path, up: [0, 0, 1], xf: F }), 'fin');
    }
  }
}
