import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { plyPanel, outline } from '../kids/ply.js';
import { spool, aim } from './parts.js';

// 线轴架：挂在墙上的一块桦木胶合板，5 排 × 8 根往上斜 15° 的木销，插满四十轴线，颜色按色相排一圈，最后一排是白、灰、黑。
// 有两根木销空着 —— 那两轴线一轴插在缝纫机上（深蓝），一轴倒在缝纫机桌上（橘红）。
// 原点在墙面上、板子的正中，板子往 +z 伸出来。
const BOARD = { w: 0.62, h: 0.5, t: 0.018 };
const ROWS = 5, COLS = 8;
const EMPTY = new Set([1, 22]);   // 这两种颜色的线不在架子上

export default {
  id: 'thread_rack',
  name: '线轴架',
  nameEn: 'Wall Thread Rack with Forty Spools',
  category: 'sewing',
  mount: 'wall',
  aoDensity: 340,
  shadow: { margin: 0.06, maxDist: 0.3, density: 160 },
  view: { el: 8, az: 20 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const { w, h, t: T } = BOARD;
    const r = { r: 0.02, segs: q(3, 2, 1) };
    plyPanel(k, { name: 'board', outline: outline([[-w / 2, -h / 2, r], [w / 2, -h / 2, r], [w / 2, h / 2, r], [-w / 2, h / 2, r]]), T, faces: [true, false], n: q(2, 1, 1), xf: xf({ pos: [0, 0, T / 2] }) });
    const tilt = (15 * Math.PI) / 180, dir = [0, Math.sin(tilt), Math.cos(tilt)];
    const dx = 0.068, dy = 0.088, L = 0.072;
    const peg = profile([[0.0045, 0], [0.0045, L - 0.003, sm], [0.0032, L, sm], [0, L + 0.0004]]);
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const x = (col - (COLS - 1) / 2) * dx, y = ((ROWS - 1) / 2 - row) * dy - 0.012;
      // 木销：插进板子 4mm
      k.lathe({ name: `peg${i}`, mat: 'birch', segs: q(6, 5, 4), profile: peg, xf: aim(dir, [0, 1, 0], [x, y - dir[1] * 0.004, T - dir[2] * 0.004]) });
      if (EMPTY.has(i)) continue;
      // 线轴：上两排是小轴，下面三排是大轴；底边离板子 6mm
      const big = row >= 2;
      spool(k, `spool${i}`, { color: i, r: big ? 0.0155 : 0.012, h: big ? 0.054 : 0.042, place: aim(dir, [0, 1, 0], [x + dir[0] * 0.006, y + dir[1] * 0.006, T + dir[2] * 0.006]) });
    }
  },
};
