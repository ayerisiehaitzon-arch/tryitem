// 动画：每个片段是“时间 → 姿势”的函数，姿势的格式和 rig.js 的 POSES 一样 ——
//   j 各关节相对父骨头的旋转（度；x 前后弯、y 拧、z 侧摆，见 rig.js），ik 胳膊（手腕放在哪，胸腔坐标），
//   feet 两只脚（踝关节放在哪、脚掌朝向，世界坐标；脚踩住不动，骨盆往哪儿挪膝盖都自己弯），
//   root 整个人平移多少，ground 先把最低的那只脚放回地面（走路、跑步这种两只脚轮流着地的）。
// 循环的动作用正弦和钟形曲线拼；一次性的动作（欢呼、鞠躬）用几段缓动接起来，做完停一会儿再重复。
// ctx：{ rest（静止姿势下各关节的位置）, B（量体数据，rig.js 的 bodyMarks） }

import { JOINTS } from './rig.js';

const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// 周期为 1 的钟形：x 在 c 附近（宽 w）为 1，离开就落到 0
const bell = (x, c, w) => { let d = x - c; d -= Math.round(d); return Math.exp(-((d / w) ** 2)); };
// 关键帧：[[t, v], …]，v 是数或数组，相邻两帧之间用 smoothstep 过渡
function keys(list, t) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    if (t > list[i][0]) continue;
    const [t0, a] = list[i - 1], [t1, b] = list[i];
    const k = smooth((t - t0) / (t1 - t0));
    return Array.isArray(a) ? a.map((x, j) => lerp(x, b[j], k)) : lerp(a, b, k);
  }
  return list[list.length - 1][1];
}
// 脚踩在静止姿势的位置（再挪 d）
const planted = (rest, side, d = [0, 0, 0]) => { const a = rest[J['ankle' + side]]; return [a[0] + d[0], a[1] + d[1], a[2] + d[2]]; };
const both = (rest, dl, dr) => ({ L: { at: planted(rest, 'L', dl) }, R: { at: planted(rest, 'R', dr) } });

export const CLIPS = {
  // 待机：呼吸（4 秒一次）、重心在两只脚之间慢慢换（8 秒一个来回，放松的那条腿脚跟抬一点）、头四处看看
  idle: {
    label: '待机', dur: 8,
    pose(t, { rest }) {
      const br = Math.sin((TAU * t) / 4);
      const w = Math.sin((TAU * t) / 8);
      const look = Math.sin((TAU * t) / 8 + 1.3);
      const relaxL = Math.max(0, -w), relaxR = Math.max(0, w); // 重心在左脚（w > 0）时右腿放松
      return {
        sym: false,
        root: [0.013 * w, -0.007, 0],
        j: {
          pelvis: [0, 1.5 * look, 2.4 * w],
          spine: [0.4 * br, 0.5 * look, -1.0 * w],
          chest: [-1.0 * br, 1.0 * look, -2.2 * w],
          neck: [0.6 * br, 1.8 * look, 0.4 * w],
          head: [1.5 * Math.sin((TAU * t) / 5.3), 6 * look + 2.5 * Math.sin((TAU * t * 3) / 8 + 0.4), 0.6 * w + 1.2 * Math.sin((TAU * t) / 6.1)],
          shoulderL: [0.5 * br, 0, 4.5 + 0.8 * br], elbowL: [-10 - 1.5 * br, 0, 0],
          shoulderR: [0.5 * br, 0, -4.5 - 0.8 * br], elbowR: [-10 - 1.5 * br, 0, 0],
        },
        feet: {
          L: { at: planted(rest, 'L', [0, 0.013 * relaxL, 0.01 * relaxL]), rot: [5 * relaxL, 0, 0] },
          R: { at: planted(rest, 'R', [0, 0.013 * relaxR, 0.01 * relaxR]), rot: [5 * relaxR, 0, 0] },
        },
      };
    },
  },

  // 走路（原地，像在跑步机上）：一步 0.55 秒。相位 0 = 左脚脚跟着地；髋、膝、踝按步态曲线，骨盆随着迈出去的腿拧、往支撑腿那边移，
  // 胳膊和同侧的腿反着摆
  walk: {
    label: '走路', dur: 1.1,
    pose(t) {
      const u = t / 1.1;
      const leg = (x) => ({
        hip: -(6 + 19 * Math.cos(TAU * x)),
        knee: 4 + 14 * bell(x, 0.13, 0.08) + 60 * bell(x, 0.72, 0.12),
        ankle: -(-6 * bell(x, 0.06, 0.05) + 9 * bell(x, 0.42, 0.12) - 16 * bell(x, 0.62, 0.06) + 5 * bell(x, 0.86, 0.1)),
      });
      const L = leg(u), R = leg(u + 0.5);
      const c = Math.cos(TAU * u), s = Math.sin(TAU * u);
      return {
        sym: false, ground: true,
        root: [0.016 * s, 0, 0],
        j: {
          pelvis: [3, -5 * c, 2.6 * s],
          spine: [1, 3 * c, -1.2 * s],
          chest: [2, 4 * c, -1.4 * s],
          neck: [-1, -1 * c, 0],
          head: [-1.5, -1 * c, 0],
          hipL: [L.hip, 0, -2.6 * s + 1], kneeL: [L.knee, 0, 0], ankleL: [L.ankle, 0, 0],
          hipR: [R.hip, 0, -2.6 * s - 1], kneeR: [R.knee, 0, 0], ankleR: [R.ankle, 0, 0],
          shoulderL: [13 * c, 0, 5], elbowL: [-(14 + 12 * Math.max(0, -c)), 0, 0],
          shoulderR: [-13 * c, 0, -5], elbowR: [-(14 + 12 * Math.max(0, c)), 0, 0],
        },
      };
    },
  },

  // 跑步（原地）：一步 0.36 秒，身子前倾，胳膊弯成直角摆；蹬地以后有一小段两只脚都离地
  run: {
    label: '跑步', dur: 0.72,
    pose(t) {
      const u = t / 0.72;
      const leg = (x) => ({
        hip: -(14 + 32 * Math.cos(TAU * (x - 0.04))),
        knee: 20 + 20 * bell(x, 0.12, 0.08) + 88 * bell(x, 0.66, 0.15),
        ankle: -(6 * bell(x, 0.12, 0.08) - 24 * bell(x, 0.36, 0.07) + 10 * bell(x, 0.78, 0.12)),
      });
      const L = leg(u), R = leg(u + 0.5);
      const c = Math.cos(TAU * u), s = Math.sin(TAU * u);
      const fly = Math.max(0, Math.cos(TAU * 2 * (u - 0.42))) ** 2;
      return {
        sym: false, ground: true,
        root: [0.012 * s, 0.04 * fly, 0],
        j: {
          pelvis: [6, -7 * c, 3 * s],
          spine: [3, 4 * c, -1.5 * s],
          chest: [4, 6 * c, -1.5 * s],
          neck: [-4, -1.5 * c, 0],
          head: [-5, -1.5 * c, 0],
          hipL: [L.hip, 0, -3 * s + 1], kneeL: [L.knee, 0, 0], ankleL: [L.ankle, 0, 0],
          hipR: [R.hip, 0, -3 * s - 1], kneeR: [R.knee, 0, 0], ankleR: [R.ankle, 0, 0],
          shoulderL: [30 * c - 6, 0, 8], elbowL: [-(80 + 12 * Math.max(0, -c)), 0, 0],
          shoulderR: [-30 * c - 6, 0, -8], elbowR: [-(80 + 12 * Math.max(0, c)), 0, 0],
        },
      };
    },
  },

  // 挥手：右手举到头边，掌心朝前，小臂绕着手肘左右摆（一秒半摆两下），头歪一点
  wave: {
    label: '挥手', dur: 1.3,
    pose(t, { rest }) {
      const w = Math.sin((TAU * t) / 0.65);
      return {
        sym: false,
        root: [-0.008, -0.006, 0],
        j: {
          pelvis: [0, -3, -1.5], chest: [0, -5, 2.5], neck: [0, -3, 2], head: [2, -6, 5 + 1.5 * w],
          shoulderL: [2, 0, 5], elbowL: [-12, 0, 0],
        },
        ik: { R: { hand: (B) => [-(B.shoulderW + 0.13) + 0.07 * w, B.chin + 0.03 + 0.012 * Math.abs(w), 0.06], pole: [-0.55, -1, -0.1], twist: -80 } },
        feet: both(rest),
      };
    },
  },

  // 跳舞：左右滑步（每秒两拍，四拍一个来回）—— 第一拍左脚往左迈，第二拍右脚并过去、脚尖点地，再往右做一遍。
  // 每一拍膝盖往下沉一下；两只手在胸前跟着往迈步的方向甩，并脚的那一拍拍一下手；上身、头朝着迈步的方向
  dance: {
    label: '跳舞', dur: 2,
    pose(t, { rest }) {
      const W = 0.085; // 一步多宽
      const step = (t0) => smooth((t - t0) / 0.32);                       // 一步从 t0 开始，0.32 秒迈完
      const lift = (t0) => (t > t0 && t < t0 + 0.32 ? Math.sin((Math.PI * (t - t0)) / 0.32) : 0);
      const offL = W * (step(0) - step(1.5)), offR = W * (step(0.5) - step(1));
      const liftL = lift(0) + lift(1.5), liftR = lift(0.5) + lift(1);
      // 并过去的那只脚：脚尖点地、脚跟抬起来，一直到它下一次迈步
      const touchR = t > 0.6 && t < 1.0 ? smooth((t - 0.6) / 0.15) * (1 - smooth((t - 0.9) / 0.1)) : 0;
      const touchL = t > 1.6 ? smooth((t - 1.6) / 0.15) * (1 - smooth((t - 1.9) / 0.1)) : 0;
      const dip = Math.cos(Math.PI * 2 * 2 * t) * 0.5 + 0.5;               // 每一拍蹲一下
      const dir = Math.sin(Math.PI * t);                                   // 往左（> 0）还是往右
      const clap = Math.exp(-((((t % 1) - 0.75) / 0.07) ** 2));             // 并脚那一拍拍手
      const cx = (offL + offR) / 2;
      // 目标点是手腕：拍手时两只手腕隔开一个手掌宽，掌心相对、手指朝前上方
      const hand = (sd) => (B) => {
        const spread = 0.13 * (1 - clap) + 0.075;
        return [sd * spread + 0.11 * dir, B.chestY - 0.07 + 0.05 * dip + 0.03 * clap, 0.17 + 0.03 * clap];
      };
      return {
        sym: false,
        root: [cx + 0.02 * dir, -0.012 - 0.03 * dip, 0],
        j: {
          pelvis: [3, 7 * dir, 4 * dir],
          spine: [2, 3 * dir, -2 * dir],
          chest: [4, 6 * dir, -4 * dir],
          neck: [0, 5 * dir, 0],
          head: [6 * dip - 3, 8 * dir, 3 * dir],
        },
        ik: {
          L: { hand: hand(1), pole: [0.85, -0.55, -0.35], dir: [-0.25, 0.75, 0.6], palm: [-1, 0, 0.2] },
          R: { hand: hand(-1), pole: [-0.85, -0.55, -0.35], dir: [0.25, 0.75, 0.6], palm: [1, 0, 0.2] },
        },
        feet: {
          L: { at: planted(rest, 'L', [offL, 0.035 * liftL + 0.026 * touchL, 0.01 * touchL]), rot: [6 * liftL + 11 * touchL, 0, 0] },
          R: { at: planted(rest, 'R', [offR, 0.035 * liftR + 0.026 * touchR, 0.01 * touchR]), rot: [6 * liftR + 11 * touchR, 0, 0] },
        },
      };
    },
  },

  // 欢呼：先蹲、两手往后甩，蹬地跳起来，两手举成 V 字，落地屈膝缓冲，再握着拳往上挥两下，最后放下
  cheer: {
    label: '欢呼', dur: 2.4,
    pose(t, { rest }) {
      const crouch = keys([[0, 0], [0.32, 0.12], [0.5, 0.02], [0.56, 0], [0.92, 0], [1.02, 0.08], [1.25, 0.02], [2.4, 0]], t);
      // 腾空：0.52 起跳，0.94 落地，抛物线
      const air = t > 0.52 && t < 0.94 ? 4 * 0.17 * ((t - 0.52) / 0.42) * (1 - (t - 0.52) / 0.42) : 0;
      const arms = keys([[0, 0], [0.32, -1], [0.62, 1], [1.95, 1], [2.3, 0], [2.4, 0]], t); // −1 往后甩，1 举起来
      const pump = t > 1.15 && t < 1.95 ? Math.sin((TAU * (t - 1.15)) / 0.4) : 0;
      const handAt = (side) => (B) => {
        const sd = side === 'L' ? 1 : -1;
        const wr = rest[J['wrist' + side]];
        const down = [wr[0], wr[1], wr[2]];
        const back = [sd * (B.hipW + 0.05), B.crotch + 0.08, -0.16];
        const top = [sd * (B.shoulderW + 0.14), B.crown + 0.14 + 0.035 * pump, 0.05];
        if (arms < 0) return lerp3(down, back, -arms);
        // 放下来的时候从身体两侧画一道弧（直接插值会从耳朵边上擦过去）
        if (t > 1.95) {
          const k = 1 - arms, side = [sd * (B.shoulderW + 0.5), B.notch - 0.05, 0.04];
          return lerp3(lerp3(top, side, k), lerp3(side, down, k), k);
        }
        return lerp3(down, top, arms);
      };
      const tuck = air > 0 ? Math.sin((Math.PI * (t - 0.52)) / 0.42) : 0;
      return {
        sym: false,
        root: [0, -crouch + air, -0.03 * crouch],
        j: {
          pelvis: [10 * (crouch / 0.12), 0, 0], spine: [4 * (crouch / 0.12) - 4 * Math.max(0, arms), 0, 0],
          chest: [6 * (crouch / 0.12) - 4 * Math.max(0, arms), 0, 0], head: [-8 * Math.max(0, arms) + 4 * (crouch / 0.12), 0, 0],
        },
        ik: {
          L: { hand: handAt('L'), pole: [0.9, -0.4, -0.3], twist: 0 },
          R: { hand: handAt('R'), pole: [-0.9, -0.4, -0.3], twist: 0 },
        },
        feet: {
          L: { at: planted(rest, 'L', [0, air - 0.02 * tuck, -0.02 * tuck]), rot: [22 * tuck, 0, 0] },
          R: { at: planted(rest, 'R', [0, air - 0.02 * tuck, -0.02 * tuck]), rot: [22 * tuck, 0, 0] },
        },
      };
    },
  },

  // 鞠躬：从腰往前弯（骨盆、腰、胸、脖子一节一节都弯一点，屁股往后坐一点保持平衡），停一下再起来，站一会儿再来
  bow: {
    label: '鞠躬', dur: 3.4,
    pose(t, { rest }) {
      const k = keys([[0, 0], [0.75, 1], [1.55, 1], [2.35, 0], [3.4, 0]], t);
      return {
        root: [0, -0.005, -0.055 * k],
        j: {
          pelvis: [16 * k, 0, 0], spine: [12 * k, 0, 0], chest: [10 * k, 0, 0], neck: [4 * k, 0, 0], head: [9 * k, 0, 0],
          shoulderL: [-6 * k, 0, 3], elbowL: [-6 - 6 * k, 0, 0],
        },
        feet: both(rest),
      };
    },
  },
};

// 动画片段在 t 秒（自动循环）时的姿势
export function clipPose(id, t, ctx) {
  const c = CLIPS[id];
  if (!c) return null;
  return c.pose(((t % c.dur) + c.dur) % c.dur, ctx);
}

// 静止的姿势也“活”一点：在上面叠一层呼吸（胸口起伏、肩膀微微抬）
export function breathe(pose, t, amp = 1) {
  const br = Math.sin((TAU * t) / 4) * amp;
  const j = { ...(pose.j ?? {}) };
  const add = (name, d) => { const a = j[name] ?? [0, 0, 0]; j[name] = [a[0] + d[0], a[1] + d[1], a[2] + d[2]]; };
  add('chest', [-0.9 * br, 0, 0]);
  add('neck', [0.5 * br, 0, 0]);
  if (!pose.ik?.L) add('shoulderL', [0, 0, 0.7 * br]);
  if (!pose.ik?.R) add('shoulderR', [0, 0, -0.7 * br]);
  return { ...pose, sym: false, j: mirrorMissing(j, pose) };
}
// breathe 把 sym 关掉了：原来靠镜像补出来的右边关节要先补上
function mirrorMissing(j, pose) {
  if (pose.sym === false) return j;
  const out = { ...j };
  for (const [name, a] of Object.entries(pose.j ?? {})) {
    if (!name.endsWith('L')) continue;
    const r = name.slice(0, -1) + 'R';
    if (pose.j[r]) continue;
    const base = [a[0], -a[1], -a[2]];
    const cur = out[r];
    out[r] = cur ? [base[0] + cur[0], base[1] + cur[1], base[2] + cur[2]] : base;
  }
  return out;
}
