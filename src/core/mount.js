// 安装面：物体靠在哪个平面上。坐标原点就在这个平面上，导入引擎时直接“贴”上去即可。
//   floor    落地 / 放在台面上：y = 0 是地面（或桌面），物体在 +y 一侧
//   wall     壁挂：z = 0 是墙面，物体朝 +z 伸出，y = 0 是安装高度
//   ceiling  吊装：y = 0 是天花板，物体挂在 -y 一侧
// n 是平面法线（指向物体一侧），u / v 是平面内的两个坐标轴，a 是法线所在的轴
export const MOUNTS = {
  floor: { n: [0, 1, 0], u: 0, v: 2, a: 1 },
  wall: { n: [0, 0, 1], u: 0, v: 1, a: 2 },
  ceiling: { n: [0, -1, 0], u: 0, v: 2, a: 1 },
};

// 平面坐标 (u, v) + 离开平面的高度 h → 三维点
export function onPlane(M, u, v, h = 0) {
  const p = [0, 0, 0];
  p[M.u] = u;
  p[M.v] = v;
  p[M.a] = h * M.n[M.a];
  return p;
}
