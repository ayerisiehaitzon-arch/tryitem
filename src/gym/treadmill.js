import { shape, rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { GYM_ATLAS } from '../materials/atlas.js';
import { swatch, region } from './parts.js';

// 跑步机：石墨色机身、拉丝铝立柱、22 寸触摸屏上放着一段“晨跑”的风景视频和运动数据。
//   · 两条侧板是同一个截面的挤出（外侧微微鼓起、上沿圆边），尾端一个大圆角包住后滚筒；侧板顶上一条防滑橡胶踏条；
//   · 跑带是一条沿“平铺在台面上 → 绕过后滚筒 → 折回台面下”的路径扫掠：从尾端看得见它包着滚筒转过去；
//   · 电机罩是一个侧面轮廓（前高后低、前沿大圆角）沿宽度的挤出，两端倒圆；罩子前面一块铜色铭牌、底下两只搬运轮；
//   · 两根立柱斜着伸向跑步的人，顶上是控制台（速度 / 坡度按键、开始 / 停止，印在图集里）和屏幕（整块自发光），
//     两边的扶手上各一段镀铬的心率感应片；控制台正面插着红色的安全锁，一根黑色的弹簧线垂下来夹在衣服上用的夹子。
// 除了跑带和踏条（橡胶跑带材质），整台机器只用一个材质（健身器材图集）。
// 原点在跑步机占地的中心（地面上）；控制台在 -z 那头，人朝 -z 跑
const RAIL = { in: 0.268, out: 0.405, top: 0.215, bot: 0.05, z0: -0.56, z1: 0.88 };
const BELT = { hw: 0.26, y: 0.199, z0: -0.52, z1: 0.8, r: 0.03, t: 0.004 };
const UPR = { x: 0.372, y0: 0.24, z0: -0.8, y1: 1.1, z1: -0.63 };
const CON = { y: 1.1, z: -0.62, tilt: 0.5 };
const SCR = { y: 1.335, z: -0.69, tilt: -0.24 };

export default {
  id: 'treadmill',
  name: '跑步机',
  nameEn: 'Treadmill with Touchscreen',
  category: 'gym',
  aoDensity: 150,
  shadow: { margin: 0.2, maxDist: 0.5, density: 70 },
  view: { el: 18, az: 32 },
  build(k) {
    const q = (...v) => k.q(...v);

    // —— 两条侧板（右边一条，左边是它的镜像）+ 顶上的橡胶踏条 + 外侧一道铜色细线 ——
    const R = RAIL;
    const railShape = shape([
      [R.in, R.bot + 0.02],
      [R.out - 0.035, R.bot, { r: q(0.01, 0.006, 0), segs: 1 }],
      [R.out + 0.004, R.bot + 0.05, { r: q(0.02, 0.012, 0), segs: q(2, 1, 1) }],
      [R.out + 0.007, R.top - 0.035, { r: q(0.025, 0.018, 0.01), segs: q(3, 2, 1) }],
      [R.out - 0.04, R.top, { r: q(0.01, 0.006, 0), segs: 1 }],
      [R.in + 0.004, R.top, { r: q(0.003, 0), segs: 1 }],
    ]);
    for (const s of [1, -1]) {
      const place = xf({ pos: [0, 0, R.z0], mirror: s > 0 ? null : 0 });
      swatch(k.extrude({
        name: `rail${s > 0 ? 'R' : 'L'}`, mat: 'gym', shape: railShape, depth: R.z1 - R.z0, axis: 'z',
        caps: [false, true], bevel: [0, { w: q(0.04, 0.03, 0.02), h: q(0.05, 0.04, 0.03) }], bsegs: q(3, 2, 1), xf: place,
      }), 'graphite');
      k.box({
        name: `tread${s > 0 ? 'R' : 'L'}`, mat: 'belt', size: [0.1, 0.003, R.z1 - R.z0 - 0.16], segs: 0, grain: 'z',
        omit: ['ny', 'nz'], xf: xf({ pos: [s * ((R.in + R.out) / 2 - 0.012), R.top + 0.0015, (R.z0 + R.z1) / 2 - 0.05] }),
      });
      if (k.lod < 2) {
        swatch(k.box({
          name: `accent${s > 0 ? 'R' : 'L'}`, mat: 'gym', size: [0.002, 0.005, R.z1 - R.z0 - 0.2], segs: 0, grain: 'z',
          omit: [s > 0 ? 'nx' : 'px', 'ny', 'py', 'nz'], xf: xf({ pos: [s * (R.out + 0.0075), R.top - 0.045, (R.z0 + R.z1) / 2 - 0.08] }),
        }), 'copper');
      }
      // 四只橡胶脚垫
      for (const z of [R.z0 + 0.08, R.z1 - 0.1]) {
        swatch(k.box({
          name: `foot${s > 0 ? 'R' : 'L'}${z > 0 ? 'B' : 'F'}`, mat: 'gym', size: [0.07, R.bot + 0.01, 0.07], r: q(0.006, 0), segs: q(1, 0), omit: ['ny'],
          xf: xf({ pos: [s * (R.out - 0.05), (R.bot + 0.01) / 2, z] }),
        }), 'rubber');
      }
    }

    // —— 跑带：台面上一段，绕过后滚筒折回台面下 ——
    {
      const B = BELT, yc = B.y - B.t / 2, cz = B.z1, cy = B.y - B.r;
      const pts = [[0, yc, B.z0], [0, yc, cz]];
      const na = q(6, 4, 2);
      for (let i = 1; i <= na; i++) {
        const a = Math.PI / 2 - (Math.PI * i) / na;
        pts.push([0, cy + (B.r - B.t / 2) * Math.sin(a), cz + (B.r - B.t / 2) * Math.cos(a)]);
      }
      pts.push([0, cy - B.r + B.t / 2, cz - 0.14]);
      // 跑带是黑的，AO 只要一个大概：图块密度减半（一半面积在台板底下看不见）
      k.sweep({ name: 'belt', mat: 'belt', shape: rect(2 * B.hw, B.t), caps: [false, false], up: [0, 1, 0], path: pts, density: { side: 0.5 } });
      // 跑带下面的台板：跑带就贴着它滑（从侧板之间的缝里、尾端滚筒下面看得见一点）
      swatch(k.box({
        name: 'deck', mat: 'gym', size: [2 * R.in, 0.018, B.z1 - B.r - 0.02 - B.z0], segs: 0, omit: ['ny', 'py'],
        xf: xf({ pos: [0, B.y - B.t - 0.009, (B.z0 + B.z1 - B.r - 0.02) / 2] }),
      }), 'matte');
    }

    // —— 电机罩：侧面轮廓（前高后低）沿宽度挤出，两端倒圆 ——
    {
      // 截面坐标 (s, y)，s = -z
      const hood = shape([
        [0.46, R.bot],
        [0.95, R.bot, { r: q(0.02, 0.012, 0), segs: 1 }],
        [0.975, 0.2, { r: q(0.06, 0.05, 0.03), segs: q(3, 2, 1) }],
        [0.86, 0.33, { r: q(0.09, 0.07, 0.05), segs: q(4, 3, 1) }],
        [0.6, 0.285, { smooth: true }],
        [0.47, 0.228, { r: q(0.02, 0.012, 0), segs: 1 }],
      ]);
      swatch(k.extrude({
        name: 'hood', mat: 'gym', shape: hood, depth: 2 * 0.41, axis: 'x',
        bevel: q(0.014, 0.01, 0), bsegs: q(2, 1, 1), xf: xf({ pos: [-0.41, 0, 0] }),
      }), 'graphite');
      if (k.lod < 2) {
        // 铜色铭牌：贴在罩子前沿的斜面上
        swatch(k.box({
          name: 'badge', mat: 'gym', size: [0.13, 0.016, 0.003], r: 0.001, segs: 1, omit: ['nz'],
          xf: xf({ pos: [0, 0.255, -0.925], rot: [-0.72, 0, 0] }),
        }), 'copper');
        // 搬运轮
        for (const s of [1, -1]) {
          swatch(k.lathe({
            name: `wheel${s > 0 ? 'R' : 'L'}`, mat: 'gym', segs: q(12, 8),
            profile: profile([[0.01, -0.013], [0.03, -0.013, { r: 0.005, segs: 1 }], [0.034, 0, { smooth: true }], [0.03, 0.013, { r: 0.005, segs: 1 }], [0.01, 0.013]]),
            xf: xf({ pos: [s * 0.3, 0.045, -0.955], rot: [0, 0, Math.PI / 2] }),
          }), 'rubber');
        }
      }
    }

    // —— 两根立柱（拉丝铝，圆角矩形截面）——
    for (const s of [1, -1]) {
      swatch(k.sweep({
        name: `upright${s > 0 ? 'R' : 'L'}`, mat: 'gym', shape: rect(0.085, 0.05, { r: q(0.018, 0.014, 0.01), segs: q(2, 1, 1) }),
        caps: [false, false], up: [1, 0, 0],
        path: [[s * UPR.x, UPR.y0, UPR.z0], [s * UPR.x, UPR.y1, UPR.z1]],
      }), 'aluminum');
    }

    // —— 控制台：一块朝跑步的人斜过来的板，顶面中间嵌着印字面板 ——
    const con = xf({ pos: [0, CON.y, CON.z], rot: [CON.tilt, 0, 0] });
    swatch(k.box({
      name: 'console', mat: 'gym', size: [0.8, 0.05, 0.2], r: q(0.02, 0.014, 0.008), segs: q(2, 1, 1), grain: 'x', xf: con,
    }), 'black');
    {
      const { w, h } = GYM_ATLAS.console;
      region(k.box({
        name: 'panel', mat: 'gym', size: [w, 0.002, h], segs: 0, grain: 'x', omit: ['ny', 'px', 'nx', 'pz', 'nz'],
        xf: con.mul(xf({ pos: [0, 0.026, 0.045] })),
      }), 'console', (t, p) => {
        // 面板的局部坐标：先回到控制台坐标系（逆旋转），x 横跨、z 朝人（v 向下 = 朝人）
        const dy = p[1] - CON.y, dz = p[2] - CON.z, c = Math.cos(CON.tilt), sn = Math.sin(CON.tilt);
        const lz = -dy * sn + dz * c;
        return [p[0] / w + 0.5, (lz - 0.045) / h + 0.5];
      });
    }
    // 屏幕：黑色的外壳，前面一块自发光的屏（铺满图集里的屏幕区域）；外壳底下一段短颈接到控制台上
    const scr = xf({ pos: [0, SCR.y, SCR.z], rot: [SCR.tilt, 0, 0] });
    swatch(k.box({
      name: 'screenHousing', mat: 'gym', size: [0.54, 0.32, 0.034], r: q(0.012, 0.008, 0.004), segs: q(2, 1, 1), xf: scr,
    }), 'black');
    {
      const { w, h } = GYM_ATLAS.screen;
      region(k.box({
        name: 'screen', mat: 'gym', size: [w, h, 0.001], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'],
        xf: scr.mul(xf({ pos: [0, 0.006, 0.0175] })),
      }), 'screen', (t, p) => {
        const dy = p[1] - SCR.y, dz = p[2] - SCR.z, c = Math.cos(SCR.tilt), sn = Math.sin(SCR.tilt);
        const ly = dy * c + dz * sn;
        return [p[0] / w + 0.5, 0.5 - (ly - 0.006) / h];
      });
    }
    swatch(k.box({
      name: 'neck', mat: 'gym', size: [0.09, 0.07, 0.024], r: q(0.008, 0), segs: q(1, 0), omit: ['ny'],
      xf: xf({ pos: [0, 1.168, -0.678], rot: [SCR.tilt, 0, 0] }),
    }), 'graphite');

    // —— 扶手：从控制台两端伸向跑步的人，末端圆头；靠近控制台的一段是镀铬的心率感应片 ——
    for (const s of [1, -1]) {
      const path = roundedPath([[s * 0.378, 1.1, -0.66], [s * 0.378, 1.075, -0.44], [s * 0.37, 1.04, -0.28]], 0.08, q(3, 2, 1));
      swatch(k.sweep({
        name: `handrail${s > 0 ? 'R' : 'L'}`, mat: 'gym', shape: circle(0.017, q(10, 8, 6)), caps: [false, true], up: [1, 0, 0], path,
      }), 'matte');
      if (k.lod < 2) {
        swatch(k.sweep({
          name: `sensor${s > 0 ? 'R' : 'L'}`, mat: 'gym', shape: circle(0.0185, q(10, 8)), caps: [true, true], up: [1, 0, 0],
          path: [[s * 0.378, 1.086, -0.555], [s * 0.378, 1.08, -0.47]],
        }), 'chrome');
      }
    }

    // —— 安全锁：控制台正面一枚红色的磁吸扣，一根黑色弹簧线垂下来，末端一个夹子 ——
    if (k.lod < 2) {
      const n = [0, -Math.sin(CON.tilt), Math.cos(CON.tilt)];
      const face = [0.16, CON.y + 0.1 * n[1], CON.z + 0.1 * n[2]];
      swatch(k.lathe({
        name: 'key', mat: 'gym', segs: q(12, 8),
        profile: profile([[0.02, 0], [0.02, 0.008, { r: 0.003, segs: 1 }], [0, 0.011]]),
        xf: xf({ pos: face, rot: [Math.atan2(n[2], n[1]), 0, 0] }),
      }), 'red');
      if (k.lod < 1) {
        // 弹簧线：一段螺旋（每圈 5 个点，平滑法线下看不出棱）
        const turns = 9, per = 5, top = face[1] - 0.018, bottom = top - 0.12;
        const pts = [];
        for (let i = 0; i <= turns * per; i++) {
          const t = i / (turns * per), a = 2 * Math.PI * i / per;
          pts.push([face[0] + 0.006 * Math.cos(a), top + (bottom - top) * t, face[2] + 0.012 + 0.006 * Math.sin(a)]);
        }
        swatch(k.sweep({ name: 'coil', mat: 'gym', shape: circle(0.0017, 3), caps: [false, false], up: [1, 0, 0], path: pts }), 'black');
        swatch(k.box({
          name: 'clip', mat: 'gym', size: [0.014, 0.036, 0.008], r: 0.003, segs: 1,
          xf: xf({ pos: [face[0], bottom - 0.016, face[2] + 0.012] }),
        }), 'black');
      }
    }
  },
};
