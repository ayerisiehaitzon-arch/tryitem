import { buildTopology } from './topology.js';
import { buildPlan, subdivide, quadNormals, signedVolume, fitLimit } from './subdiv.js';
import { landmarks, placeBody } from './body.js';
import { withDefaults } from './params.js';
import { cageColors } from './face.js';
import { restJoints, skinWeights, poseTransforms, applyPose, bodyMarks } from './rig.js';

export { PARAMS, DEFAULTS, withDefaults } from './params.js';
export { eyeballGeometry, eyeTexture, eyePlacement } from './eyes.js';
export { GARMENTS, buildGarment, evalGarment, cageNormals, bodyIndex } from './clothes.js';
export { HAIRSTYLES, buildHair, evalHair } from './hair.js';
export { browMesh, toWorld, cageColors } from './face.js';
export { POSES, JOINTS, jointMatrix } from './rig.js';
export { GLASSES, glassesMesh } from './accessories.js';

// 角色生成器的入口：拓扑和细分计划只建一次，之后每次改参数只重算控制点和细分。
export function createBody({ levels = 2 } = {}) {
  const topo = buildTopology();
  const plan = buildPlan(topo.faces, topo.n, levels, { corners: topo.corners });
  const body = { topo, plan, levels };
  // 用默认参数确认一次朝向：有向体积为负说明整体翻了，把所有面反过来再建计划
  const test = evalCage(body, withDefaults());
  if (signedVolume(topo.faces, test.cage) < 0) {
    for (const f of topo.faces) f.reverse();
    body.plan = buildPlan(topo.faces, topo.n, levels, { corners: topo.corners });
  }
  return body;
}

export function evalCage(body, params) {
  const p = withDefaults(params);
  const L = landmarks(p);
  const cage = new Float32Array(body.topo.n * 3);
  const head = placeBody(body.topo, p, L, cage);
  return { p, L, cage, head };
}

// look（可选）：皮肤、嘴唇、腮红、胡茬……给了就连顶点色一起细分（每个点 6 个数：位置 + 颜色）
export function evalBody(body, params, { fit = 14, look = null, pose = 'stand' } = {}) {
  const { p, L, cage: target, head } = evalCage(body, params);
  // 姿势：在“曲面上的目标点”这一层蒙皮，之后的拟合、细分、衣服都在摆好姿势的身体上做
  body.weights ??= skinWeights(body.topo);
  const rig = poseTransforms(restJoints(L, head), pose, bodyMarks(L));
  if (pose && pose !== 'stand') applyPose(target, body.weights, rig);
  // 摆好的点是“曲面应该经过的位置”，反求出控制网格再细分
  const cage = fit ? fitLimit(body.plan, target, { iters: fit, mask: body.topo.fitMask }) : target;
  let positions, colors = null;
  if (look) {
    const key = JSON.stringify(look);
    if (body.colorKey !== key) { body.colorKey = key; body.cageColor = cageColors(body.topo, look); }
    const n = body.topo.n, src = new Float32Array(n * 6), C = body.cageColor;
    for (let i = 0; i < n; i++) {
      src[i * 6] = cage[i * 3]; src[i * 6 + 1] = cage[i * 3 + 1]; src[i * 6 + 2] = cage[i * 3 + 2];
      src[i * 6 + 3] = C[i * 3]; src[i * 6 + 4] = C[i * 3 + 1]; src[i * 6 + 5] = C[i * 3 + 2];
    }
    const out = subdivide(body.plan, src, 6);
    const m = out.length / 6;
    positions = new Float32Array(m * 3);
    colors = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      positions[i * 3] = out[i * 6]; positions[i * 3 + 1] = out[i * 6 + 1]; positions[i * 3 + 2] = out[i * 6 + 2];
      colors[i * 3] = out[i * 6 + 3]; colors[i * 3 + 1] = out[i * 6 + 4]; colors[i * 3 + 2] = out[i * 6 + 5];
    }
  } else positions = subdivide(body.plan, cage, 3);
  const normals = quadNormals(body.plan.quads, positions);
  return { p, L, cage, target, head, rig, positions, normals, colors, index: body.plan.tris };
}
