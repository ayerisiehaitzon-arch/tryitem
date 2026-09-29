import { profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { BAND_ATLAS, bandUV } from '../materials/atlas.js';
import { sw, mapUV, pipe } from './parts.js';

// 吉他音箱：一台 1 × 12 寸的电子管音箱（黑面板那一种）。
//   · 箱体包黑色人造革（和琴凳拉扣的黑皮革同一张贴图），四周大圆角；正面下面一大块银黑平纹的网布，
//     四周一圈白色的滚边；网布左上角一块拉丝银的铭牌；
//   · 上面一条黑色的控制面板（贴图里印着 INPUT / VOLUME / TREBLE / BASS / REVERB / SPEED / INTENSITY / POWER，每个旋钮一圈刻度）：
//     两个输入插孔、六个黑色的裙边旋钮、电源拨杆，最右边一颗红宝石指示灯（自发光）；
//   · 顶上一根黑皮提手（两头镀铬的扣），底下四个镀铬的脚钉；
//   · 原点在箱底中心的地面，正面朝 +z。
const W = 0.62, H = 0.44, D = 0.245, R = 0.014;
const GRILLE = { y0: 0.035, y1: 0.335, w: 0.556 };
const PANEL = BAND_ATLAS.panel;
const PY = 0.3875;   // 面板中心高度

export default {
  id: 'guitar_amp',
  name: '吉他音箱',
  nameEn: 'Tube Guitar Combo Amp',
  category: 'band',
  aoDensity: 300,
  shadow: { margin: 0.12, maxDist: 0.45, density: 120 },
  view: { el: 14, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const zf = D / 2;

    // —— 箱体（人造革）——
    k.box({ name: 'cabinet', mat: 'leather_black', size: [W, H, D], r: R, segs: q(3, 2, 1), grain: 'x', xf: xf({ pos: [0, H / 2 + 0.012, 0] }) });
    const y0 = 0.012;

    // —— 网布、白色滚边 ——
    const gh = GRILLE.y1 - GRILLE.y0, gy = y0 + (GRILLE.y0 + GRILLE.y1) / 2;
    k.box({ name: 'grille', mat: 'grille', size: [GRILLE.w, gh, 0.004], segs: 0, omit: ['nz'], grain: 'x', xf: xf({ pos: [0, gy, zf + 0.001] }) });
    {
      const hw = GRILLE.w / 2 + 0.002, hh = gh / 2 + 0.002, z = zf + 0.0025;
      const pts = [[0, gy - hh, z], [hw, gy - hh, z], [hw, gy + hh, z], [-hw, gy + hh, z], [-hw, gy - hh, z], [0, gy - hh, z]];
      pipe(k, 'piping', roundedPath(pts, [0, 0.006, 0.006, 0.006, 0.006, 0], q(3, 2, 1)).slice(0, -1), 0.0022, 'knobWhite', { segs: q(6, 4, 3), closed: true, up: [0, 0, 1] });
    }
    // 铭牌
    {
      const B = BAND_ATLAS.badge;
      const b = k.box({ name: 'badge', mat: 'band', size: [B.w, B.h, 0.004], r: q(0.003, 0), segs: q(1, 0), omit: ['nz'] });
      mapUV(b, (v, n) => (n[2] > 0.7 ? bandUV('badge', (v[0] + B.w / 2) / B.w, (B.h / 2 - v[1]) / B.h) : bandUV('badge', 0.02, 0.5)));
      b.transform(xf({ pos: [-0.19, y0 + GRILLE.y1 - 0.05, zf + 0.004] }));
    }

    // —— 控制面板 ——
    {
      const p = k.box({ name: 'panel', mat: 'band', size: [PANEL.w, PANEL.h, 0.003], segs: 0, omit: ['nz'] });
      mapUV(p, (v) => bandUV('panel', (v[0] + PANEL.w / 2) / PANEL.w, (PANEL.h / 2 - v[1]) / PANEL.h));
      p.transform(xf({ pos: [0, y0 + PY, zf + 0.0005] }));
      const zp = zf + 0.002, at = (x, dy) => [x - PANEL.w / 2, y0 + PY + PANEL.h / 2 - dy, zp];
      const fwd = [Math.PI / 2, 0, 0];   // 车削轴 +y → +z
      PANEL.knobs.forEach((x, i) => {
        sw(k.lathe({ name: `knob${i}`, mat: 'band', segs: q(14, 10, 6), profile: profile([[0.0148, 0], [0.0148, 0.003, sm], [0.0112, 0.0045], [0.0106, 0.0175, sm], [0.0092, 0.0195, sm], [0, 0.0202]]), xf: xf({ pos: at(x, PANEL.knobY), rot: fwd }) }), 'knobBlack');
      });
      PANEL.jacks.forEach((x, i) => {
        sw(k.lathe({ name: `jack${i}`, mat: 'band', segs: q(10, 8, 6), profile: profile([[0.0072, 0], [0.0072, 0.003, sm], [0.0045, 0.0042], [0.0045, 0.0005]]), xf: xf({ pos: at(x, 0.045), rot: fwd }) }), 'chrome');
      });
      sw(k.lathe({ name: 'powerBase', mat: 'band', segs: q(10, 8, 6), profile: profile([[0.0068, 0], [0.0068, 0.004, sm], [0, 0.0045]]), xf: xf({ pos: at(PANEL.power, 0.045), rot: fwd }) }), 'chrome');
      if (k.lod < 2) sw(k.lathe({ name: 'powerBat', mat: 'band', segs: q(6, 4), profile: profile([[0.0018, 0], [0.0024, 0.016, sm], [0, 0.017]]), xf: xf({ pos: at(PANEL.power, 0.045), rot: [Math.PI / 2 - 0.4, 0, 0] }) }), 'chrome');
      // 红宝石指示灯：多面的红玻璃顶（8 边，看得出刻面），一圈镀铬的座
      sw(k.lathe({ name: 'jewelBezel', mat: 'band', segs: q(12, 8, 6), profile: profile([[0.0115, 0], [0.0115, 0.005, sm], [0.0082, 0.0065]]), xf: xf({ pos: at(PANEL.jewel, 0.045), rot: fwd }) }), 'chrome');
      sw(k.lathe({ name: 'jewel', mat: 'band', segs: 8, profile: profile([[0.0082, 0.005], [0.0076, 0.0095], [0.0045, 0.014], [0, 0.015]]), xf: xf({ pos: at(PANEL.jewel, 0.045), rot: fwd }) }), 'jewel');
    }

    // —— 提手：黑皮，两头镀铬的扣 ——
    {
      const yt = y0 + H;
      const path = [];
      const n = q(10, 6, 4);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = -0.105 + 0.21 * t;
        path.push([x, yt + 0.006 + 0.034 * Math.sin(Math.PI * t) ** 0.8, 0]);
      }
      k.sweep({ name: 'handle', mat: 'leather_black', shape: rect(0.008, 0.03, { r: q(0.003, 0.002, 0), segs: 1 }), path, caps: [true, true], up: [0, 0, 1] });
      for (const s of [-1, 1]) {
        sw(k.box({ name: `handleCap${s > 0 ? 'R' : 'L'}`, mat: 'band', size: [0.03, 0.012, 0.036], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), omit: ['ny'], xf: xf({ pos: [s * 0.115, yt + 0.006, 0] }) }), 'chrome');
      }
    }
    // —— 脚钉 ——
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      sw(k.lathe({ name: `foot${x > 0 ? 'R' : 'L'}${z > 0 ? 'F' : 'B'}`, mat: 'band', segs: q(10, 8, 6), profile: profile([[0, 0], [0.012, 0.002, sm], [0.014, 0.008, sm], [0.012, 0.012]]), xf: xf({ pos: [x * (W / 2 - 0.05), 0, z * (D / 2 - 0.04)] }) }), 'chrome');
    }
  },
};
