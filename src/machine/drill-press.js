import { shape, profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { mechUV } from '../materials/atlas.js';
import { sw, put, rod, turned, ballKnob, mapUV, frame, ccw } from './parts.js';

// 立式钻床：锤纹漆的底座和机头，一根磨光的立柱，升降工作台（靠齿条升降，一边摇把、一边锁紧手柄），
// 台面上一台平口钳夹着一块钢板。机头上面是皮带罩（侧面贴着转速表），后面挂着电机；机头正面一块铭牌和开关，
// 左边一根深度限位杆和刻度；主轴套筒下面是钻夹头和一支钻头，右边三根进给手柄（黑色胶木球头）。
// 原点在底座正下方的地面，正面（进给手柄、钻头那边）朝 +z。
const COL = { z: -0.1, r: 0.04, top: 1.56 };
const TABLE_Y = 0.8, HEAD = { y0: 1.36, y1: 1.6, z0: -0.19, z1: 0.2 }, SPINDLE = [0, 0, 0.09];
const sm = { smooth: true };

export default {
  id: 'drill_press',
  name: '立式钻床',
  nameEn: 'Floor Drill Press with Vise',
  category: 'machine',
  aoDensity: 240,
  shadow: { margin: 0.14, maxDist: 0.7, density: 110 },
  view: { el: 12, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const HT = 'hammertone';
    const cast = (name, size, pos, r = 0.012, extra = {}) => k.box({ name, mat: HT, size, r, segs: q(2, 1, 1), xf: xf({ pos }), ...extra });
    const label = (name, region, w, h, place) => {
      const b = k.box({ name, mat: 'mech', size: [w, h, 0.002], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'] });
      mapUV(b, (p) => mechUV(region, p[0] / w + 0.5, 0.5 - p[1] / h));
      return b.transform(place);
    };

    // —— 底座：铸铁底板，上面一块机加工的台面和两道 T 形槽 ——
    cast('base', [0.46, 0.06, 0.36], [0, 0.03, 0], 0.012, { omit: ['ny'] });
    sw(k.box({ name: 'basePad', mat: 'mech', size: [0.3, 0.004, 0.2], segs: 0, omit: ['ny'], xf: xf({ pos: [0, 0.062, 0.05] }) }), 'steel');
    for (const x of [-0.06, 0.06]) sw(k.box({ name: `slot${x > 0 ? 'R' : 'L'}`, mat: 'mech', size: [0.014, 0.003, 0.2], segs: 0, omit: ['ny'], xf: xf({ pos: [x, 0.0645, 0.05] }) }), 'blackMatte');
    // —— 立柱：法兰座 + 磨光的钢管 + 升降齿条 ——
    turned(k, 'columnFoot', [[0.078, 0], [0.078, 0.02, sm], [0.06, 0.04, sm], [0.05, 0.06], [0, 0.061]], null, { segs: q(18, 12, 8), mat: HT, place: xf({ pos: [0, 0.06, COL.z] }) });
    rod(k, 'column', [0, 0.06, COL.z], [0, COL.top, COL.z], COL.r, 'bright', { segs: q(16, 12, 8) });
    sw(k.box({ name: 'rack', mat: 'mech', size: [0.012, 0.9, 0.02], r: 0.002, segs: q(1, 1, 0), xf: xf({ pos: [0.044, 0.72, COL.z] }) }), 'steel');

    // —— 升降工作台：套在立柱上的抱箍、往前伸的臂、圆台面（上面机加工、三道槽），摇把和锁紧手柄 ——
    {
      const y = TABLE_Y;
      turned(k, 'tableCollar', [[0.062, -0.12], [0.064, -0.11, sm], [0.064, -0.01, sm], [0.062, 0]], null, { segs: q(18, 12, 8), mat: HT, place: xf({ pos: [0, y, COL.z] }) });
      cast('tableArm', [0.09, 0.07, 0.2], [0, y - 0.06, (COL.z + SPINDLE[2]) / 2], 0.02);
      turned(k, 'table', [[0, -0.045], [0.05, -0.04, sm], [0.15, -0.012, sm], [0.16, -0.004], [0.16, 0]], null, { segs: q(28, 20, 12), mat: HT, place: xf({ pos: [0, y, SPINDLE[2]] }) });
      sw(turned(k, 'tableTop', [[0.158, 0], [0.158, 0.004], [0, 0.004]], null, { segs: q(28, 20, 12), place: xf({ pos: [0, y - 0.002, SPINDLE[2]] }) }), 'steel');
      for (const [i, a] of [[0, 0], [1, Math.PI / 3], [2, -Math.PI / 3]]) sw(k.box({ name: `tableSlot${i}`, mat: 'mech', size: [0.012, 0.002, 0.26], segs: 0, omit: ['ny'], xf: xf({ pos: [0, y + 0.002, SPINDLE[2]], rot: [0, a, 0] }) }), 'blackMatte');
      rod(k, 'crankShaft', [0.06, y - 0.07, COL.z + 0.02], [0.14, y - 0.07, COL.z + 0.02], 0.007, 'bright', { segs: q(6, 5, 4) });
      rod(k, 'crankArm', [0.14, y - 0.07, COL.z + 0.02], [0.14, y - 0.14, COL.z + 0.06], 0.006, 'bright', { segs: q(6, 5, 4) });
      ballKnob(k, 'crankKnob', { r: 0.011, stem: 0.04, place: xf({ pos: [0.14, y - 0.14, COL.z + 0.06], rot: [0, 0, -Math.PI / 2] }) });
      ballKnob(k, 'tableLock', { r: 0.011, stem: 0.08, place: xf({ pos: [-0.06, y - 0.06, COL.z], rot: [0, 0, Math.PI / 2 - 0.2] }) });
    }

    // —— 平口钳：底座、固定钳口、活动钳口（淬火的钳口板）、丝杠和 T 形手柄，夹着一块钢板 ——
    {
      const y = TABLE_Y + 0.004, z0 = SPINDLE[2];
      sw(k.box({ name: 'viseBase', mat: 'mech', size: [0.16, 0.03, 0.2], r: 0.006, segs: q(2, 1, 1), xf: xf({ pos: [0, y + 0.015, z0] }) }), 'blue');
      sw(k.box({ name: 'viseFixed', mat: 'mech', size: [0.16, 0.05, 0.04], r: 0.006, segs: q(2, 1, 1), xf: xf({ pos: [0, y + 0.055, z0 - 0.08] }) }), 'blue');
      sw(k.box({ name: 'viseMoving', mat: 'mech', size: [0.15, 0.045, 0.045], r: 0.006, segs: q(2, 1, 1), xf: xf({ pos: [0, y + 0.052, z0 + 0.02] }) }), 'blue');
      for (const [i, zz] of [[0, z0 - 0.058], [1, z0 - 0.0055]]) sw(k.box({ name: `jawPlate${i}`, mat: 'mech', size: [0.13, 0.03, 0.006], r: 0.001, segs: q(1, 1, 0), xf: xf({ pos: [0, y + 0.062, zz] }) }), 'steel');
      sw(k.box({ name: 'workpiece', mat: 'mech', size: [0.11, 0.05, 0.044], r: 0.002, segs: q(1, 1, 0), xf: xf({ pos: [0, y + 0.072, z0 - 0.0325] }) }), 'millScale');
      rod(k, 'viseScrew', [0, y + 0.03, z0 + 0.04], [0, y + 0.03, z0 + 0.14], 0.008, 'bright', { segs: q(8, 6, 4) });
      rod(k, 'viseBar', [-0.06, y + 0.03, z0 + 0.14], [0.06, y + 0.03, z0 + 0.14], 0.005, 'bright', { segs: q(6, 5, 4) });
      for (const s of [-1, 1]) turned(k, `viseBall${s > 0 ? 'R' : 'L'}`, [[0, -0.009], [0.009, 0, sm], [0, 0.009]], 'bright', { segs: q(8, 6, 4), place: xf({ pos: [s * 0.066, y + 0.03, z0 + 0.14] }) });
    }

    // —— 机头、皮带罩、电机 ——
    {
      const { y0, y1, z0, z1 } = HEAD, yc = (y0 + y1) / 2;
      cast('head', [0.26, y1 - y0, z1 - z0], [0, yc, (z0 + z1) / 2], 0.045);
      cast('beltCover', [0.28, 0.12, 0.54], [0, y1 + 0.055, -0.04], 0.05);
      turned(k, 'quillBoss', [[0.052, 0], [0.056, 0.01, sm], [0.056, 0.08]], null, { segs: q(18, 12, 8), mat: HT, place: xf({ pos: [SPINDLE[0], y0 - 0.03, SPINDLE[2]] }) });
      // 电机：挂在机头后面，沿 z
      turned(k, 'motor', [[0, 0], [0.05, 0], [0.072, 0.012, sm], [0.075, 0.03, sm], [0.075, 0.17, sm], [0.07, 0.19, sm], [0.03, 0.2], [0, 0.201]], null, { segs: q(18, 12, 8), mat: HT, place: xf({ pos: [0, y0 + 0.13, z0 - 0.01], rot: [-Math.PI / 2, 0, 0] }) });
      sw(k.box({ name: 'motorBox', mat: 'mech', size: [0.06, 0.05, 0.08], r: 0.008, segs: q(2, 1, 1), xf: xf({ pos: [0.075, y0 + 0.13, z0 - 0.1] }) }), 'machine');
      // 正面：铭牌、开关（绿开红停）
      label('maker', 'maker', 0.1, 0.05, xf({ pos: [0, yc + 0.06, z1 + 0.001] }));
      label('switchPlate', 'switches', 0.07, 0.035, xf({ pos: [0.065, yc - 0.05, z1 + 0.001] }));
      for (const [i, dx, c] of [[0, -0.0175, 'green'], [1, 0.0175, 'knobRed']]) {
        turned(k, `button${i}`, [[0, 0], [0.007, 0], [0.007, 0.007, sm], [0.005, 0.01, sm], [0, 0.011]], c, { segs: q(10, 8, 6), place: xf({ pos: [0.065 + dx, yc - 0.054, z1 + 0.002], rot: [Math.PI / 2, 0, 0] }) });
      }
      // 皮带罩右侧的转速表、机头左侧的警示贴
      label('speedChart', 'drillChart', 0.1, 0.1, frame([0, 0, -1], [0, 1, 0], [1, 0, 0], [0.141, y1 + 0.055, 0.02]).mul(xf({ rot: [0, 0, 0] })));
      label('warning', 'warning', 0.1, 0.05, frame([0, 0, 1], [0, 1, 0], [-1, 0, 0], [-0.131, yc, 0.04]));
      // 深度限位杆和刻度
      rod(k, 'depthRod', [-0.09, y0 - 0.08, 0.15], [-0.09, y0 + 0.08, 0.15], 0.005, 'bright', { segs: q(6, 5, 4) });
      for (const [i, yy] of [[0, y0 - 0.02], [1, y0 - 0.035]]) turned(k, `depthNut${i}`, [[0, 0], [0.011, 0], [0.011, 0.01], [0, 0.0101]], 'bright', { segs: 6, place: xf({ pos: [-0.09, yy, 0.15] }) });
      label('depthScale', 'scale', 0.1, 0.008, frame([0, 1, 0], [-1, 0, 0], [0, 0, 1], [-0.068, y0 + 0.12, z1 + 0.001]));
    }

    // —— 主轴套筒、钻夹头、钻头 ——
    {
      const [x, , z] = SPINDLE, top = HEAD.y0 - 0.03;
      rod(k, 'quill', [x, top + 0.005, z], [x, top - 0.07, z], 0.027, 'bright', { segs: q(14, 10, 6), caps: [false, true] });
      turned(k, 'chuck', [[0, 0], [0.012, 0], [0.014, 0.012, sm], [0.022, 0.035, sm], [0.026, 0.05, sm], [0.026, 0.078, sm], [0.021, 0.09], [0, 0.091]], 'bright', { segs: q(14, 10, 6), place: xf({ pos: [x, top - 0.07 - 0.091, z] }) });
      turned(k, 'bit', [[0, 0], [0.0046, 0.006], [0.0046, 0.12, sm], [0, 0.121]], 'steel', { segs: q(8, 6, 4), place: xf({ pos: [x, top - 0.07 - 0.091 - 0.1, z] }) });
    }
    // —— 进给手柄：机头右边一个轮毂，三根手柄，黑色胶木球头 ——
    {
      const hub = [0.135, HEAD.y0 + 0.07, 0.05];
      turned(k, 'feedHub', [[0, 0], [0.035, 0], [0.036, 0.01, sm], [0.03, 0.03, sm], [0, 0.031]], 'bright', { segs: q(14, 10, 6), place: xf({ pos: hub, rot: [0, 0, -Math.PI / 2] }) });
      for (let i = 0; i < 3; i++) {
        const a = 0.9 + (2 * Math.PI * i) / 3, dir = [0, Math.sin(a), Math.cos(a)];
        const p0 = [hub[0] + 0.02, hub[1] + dir[1] * 0.025, hub[2] + dir[2] * 0.025], p1 = [hub[0] + 0.02, hub[1] + dir[1] * 0.2, hub[2] + dir[2] * 0.2];
        rod(k, `feedArm${i}`, p0, p1, 0.0065, 'bright', { segs: q(6, 5, 4) });
        turned(k, `feedKnob${i}`, [[0, 0], [0.012, 0.012, sm], [0.019, 0.034, sm], [0.012, 0.05, sm], [0, 0.052]], 'bakelite', { segs: q(10, 8, 6), place: frame([1, 0, 0], dir, [0, -dir[2], dir[1]], p1).mul(xf({ pos: [0, -0.005, 0] })) });
      }
    }
  },
};
