import { xf } from '../core/vec.js';
import { roundLeg, barPull } from './parts.js';

// 双门衣柜：胡桃木 + 黄铜 D 形拉手 + 外撇锥腿（和床头柜是一套）
//   · 柜体、顶板、门板、抽屉面板全部是倒角盒子；门和抽屉面板凸出柜体 16mm，
//     之间 4mm 的缝在烘焙 AO 里自然变暗 —— 不需要任何“门缝”几何
//   · 顶板四周比柜体宽出 1cm，上沿圆边：大件家具的轮廓精致感主要来自这一圈
//   · 两扇门“对花”：右门是左门的镜像，共用同一块木纹 —— 花纹沿门缝左右对称，像一张木皮对剖开；
//     两个抽屉面板共用木纹并按高度平移，木纹跨过抽屉缝连续，像从同一块板上裁下来。都不花一个面
//   · 腿脚套一截黄铜脚套，和拉手呼应
//   · 拉手是一条扫掠路径（两个立脚 + 横杆），LOD2 去掉
export default {
  id: 'wardrobe',
  name: '衣柜',
  nameEn: 'Nordic Wardrobe',
  build(k) {
    const q = (...v) => k.q(...v);
    const W = 1.0, D = 0.58, legH = 0.12;
    const bodyW = W - 0.02, bodyH = 1.856, bodyD = D - 0.02;
    const front = D / 2 - 0.02; // 柜体正面 z
    const c = q(0.003, 0.003, 0), cs = q(1, 1, 0);

    // 柜体
    k.box({
      name: 'body', mat: 'walnut', size: [bodyW, bodyH, bodyD], r: c, segs: cs,
      density: { ny: 0.2, nz: 0.3 },
      xf: xf({ pos: [0, legH + bodyH / 2, front - bodyD / 2] }),
    });
    // 顶板：四周出檐 1cm，上沿圆边
    k.box({
      name: 'top', mat: 'walnut', size: [W, 0.024, D], r: q(0.005, 0.004, 0), segs: q(2, 1, 0), grain: 'x',
      density: { ny: 0.3 },
      xf: xf({ pos: [0, legH + bodyH + 0.012, 0] }),
    });

    // 正面：下面两个抽屉，上面两扇门
    const m = 0.012, gap = 0.004, t = 0.02;
    const zf = front + t / 2 - 0.004; // 面板中心（嵌入柜体 4mm，凸出 16mm）
    const panelFront = zf + t / 2;
    const dh = 0.19, fw = bodyW - 2 * m;
    for (let i = 0; i < 2; i++) {
      const y = legH + m + dh / 2 + i * (dh + gap);
      const d = k.box({
        name: `drawer${i}`, mat: 'walnut', size: [fw, dh, t], r: c, segs: cs, omit: ['nz'], grain: 'x',
        xf: xf({ pos: [0, y, zf] }),
      });
      d.uvKey = 'drawers';
      d.uvShift = [0, y];
      if (k.lod < 2) {
        barPull(k, { name: `dpull${i}`, mat: 'brass', len: 0.16, axis: 'x', segs: q(6, 5), csegs: q(2, 1), pos: [0, y, panelFront] });
      }
    }
    const doorY0 = legH + m + 2 * dh + 2 * gap;
    const doorH = legH + bodyH - m - doorY0;
    const dw = (fw - gap) / 2;
    for (const s of [1, -1]) {
      const door = k.box({
        name: `door${s > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [dw, doorH, t], r: c, segs: cs, omit: ['nz'], grain: 'y',
        xf: xf({ pos: [s * (gap / 2 + dw / 2), doorY0 + doorH / 2, zf], mirror: s > 0 ? 0 : null }),
      });
      door.uvKey = 'doors';
      if (k.lod < 2) {
        barPull(k, {
          name: `pull${s > 0 ? 'R' : 'L'}`, mat: 'brass', len: 0.3, axis: 'y', segs: q(6, 5), csegs: q(2, 1),
          pos: [s * (gap / 2 + 0.045), 1.1, panelFront],
        });
      }
    }

    // 腿：和床头柜一样外撇 6°
    const tilt = (6 * Math.PI) / 180;
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      roundLeg(k, {
        name: `leg${i}`, mat: 'walnut', r0: 0.012, r1: 0.019, h: legH / Math.cos(tilt) + 0.01, segs: q(8, 6, 5), sabot: { mat: 'brass', h: 0.035 },
        pos: [sx * (bodyW / 2 - 0.05) + sx * 0.012, 0, (front - bodyD / 2) + sz * (bodyD / 2 - 0.05) + sz * 0.012],
        rot: [-tilt, Math.atan2(sx, sz), 0],
      });
    }
  },
};
