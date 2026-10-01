// 捏人参数。滑杆的值大多是 −1 … 1（0 = 平均），性别特征 0 … 1、肌肉 0 … 1、身高用厘米。
// group / label 给创建器的界面用；body.js、head.js 只读数值。
export const PARAMS = [
  // —— 体型 ——
  { id: 'sex', group: 'body', label: '性别特征', min: 0, max: 1, def: 0.5, step: 0.01, ends: ['男性', '女性'] },
  { id: 'height', group: 'body', label: '身高', min: 150, max: 198, def: 172, step: 1, unit: 'cm' },
  { id: 'weight', group: 'body', label: '胖瘦', min: -1, max: 1, def: 0, ends: ['瘦', '胖'] },
  { id: 'muscle', group: 'body', label: '肌肉', min: 0, max: 1, def: 0.25 },
  { id: 'shoulders', group: 'body', label: '肩宽', min: -1, max: 1, def: 0 },
  { id: 'chest', group: 'body', label: '胸围', min: -1, max: 1, def: 0 },
  { id: 'waist', group: 'body', label: '腰围', min: -1, max: 1, def: 0 },
  { id: 'hips', group: 'body', label: '臀围', min: -1, max: 1, def: 0 },
  { id: 'legs', group: 'body', label: '腿长', min: -1, max: 1, def: 0 },
  { id: 'arms', group: 'body', label: '臂长', min: -1, max: 1, def: 0 },
  { id: 'neck', group: 'body', label: '脖子', min: -1, max: 1, def: 0, ends: ['短粗', '修长'] },
  { id: 'head', group: 'body', label: '头部大小', min: -1, max: 1, def: 0 },
  // —— 脸型 ——
  { id: 'faceWidth', group: 'face', label: '脸宽', min: -1, max: 1, def: 0 },
  { id: 'faceLength', group: 'face', label: '脸长', min: -1, max: 1, def: 0 },
  { id: 'jaw', group: 'face', label: '下颌', min: -1, max: 1, def: 0, ends: ['尖', '方'] },
  { id: 'chin', group: 'face', label: '下巴长短', min: -1, max: 1, def: 0 },
  { id: 'chinWidth', group: 'face', label: '下巴宽窄', min: -1, max: 1, def: 0 },
  { id: 'chinForward', group: 'face', label: '下巴前后', min: -1, max: 1, def: 0 },
  { id: 'cheekbones', group: 'face', label: '颧骨', min: -1, max: 1, def: 0 },
  { id: 'cheeks', group: 'face', label: '脸颊', min: -1, max: 1, def: 0, ends: ['凹', '饱满'] },
  { id: 'forehead', group: 'face', label: '额头', min: -1, max: 1, def: 0 },
  // —— 眼睛 ——
  { id: 'eyeSize', group: 'eyes', label: '大小', min: -1, max: 1, def: 0 },
  { id: 'eyeSpacing', group: 'eyes', label: '间距', min: -1, max: 1, def: 0 },
  { id: 'eyeHeight', group: 'eyes', label: '高低', min: -1, max: 1, def: 0 },
  { id: 'eyeTilt', group: 'eyes', label: '眼角', min: -1, max: 1, def: 0, ends: ['下垂', '上挑'] },
  { id: 'eyeOpen', group: 'eyes', label: '眼型', min: -1, max: 1, def: 0, ends: ['细长', '圆'] },
  { id: 'lid', group: 'eyes', label: '眼皮', min: -1, max: 1, def: 0, ends: ['内双', '深双'] },
  // —— 眉毛 ——
  { id: 'browHeight', group: 'brows', label: '高低', min: -1, max: 1, def: 0 },
  { id: 'browAngle', group: 'brows', label: '角度', min: -1, max: 1, def: 0, ends: ['八字', '剑眉'] },
  { id: 'browArch', group: 'brows', label: '弧度', min: -1, max: 1, def: 0, ends: ['平', '挑'] },
  { id: 'browThick', group: 'brows', label: '粗细', min: -1, max: 1, def: 0 },
  { id: 'browLength', group: 'brows', label: '长短', min: -1, max: 1, def: 0 },
  // —— 鼻子 ——
  { id: 'noseLength', group: 'nose', label: '鼻长', min: -1, max: 1, def: 0 },
  { id: 'noseWidth', group: 'nose', label: '鼻翼', min: -1, max: 1, def: 0 },
  { id: 'noseBridge', group: 'nose', label: '鼻梁', min: -1, max: 1, def: 0, ends: ['低', '高'] },
  { id: 'noseTip', group: 'nose', label: '鼻尖', min: -1, max: 1, def: 0, ends: ['下勾', '上翘'] },
  { id: 'noseSize', group: 'nose', label: '鼻头', min: -1, max: 1, def: 0 },
  // —— 嘴 ——
  { id: 'mouthWidth', group: 'mouth', label: '嘴宽', min: -1, max: 1, def: 0 },
  { id: 'lips', group: 'mouth', label: '唇厚', min: -1, max: 1, def: 0 },
  { id: 'upperLip', group: 'mouth', label: '上下唇', min: -1, max: 1, def: 0, ends: ['下唇厚', '上唇厚'] },
  { id: 'mouthHeight', group: 'mouth', label: '高低', min: -1, max: 1, def: 0 },
  { id: 'mouthCorner', group: 'mouth', label: '嘴角', min: -1, max: 1, def: 0, ends: ['下撇', '上扬'] },
  // —— 耳朵 ——
  { id: 'earSize', group: 'ears', label: '大小', min: -1, max: 1, def: 0 },
  { id: 'earOut', group: 'ears', label: '招风', min: -1, max: 1, def: 0 },
  { id: 'earPoint', group: 'ears', label: '尖耳', min: 0, max: 1, def: 0 },
];

export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.id, p.def]));

// 表情、姿势：不在滑杆列表里，由创建器的按钮切换（也会被动画驱动，比如眨眼）
export const EXPRESSION_DEFAULTS = { smile: 0, frown: 0, browUp: 0, browDown: 0, blink: 0, blinkL: 0, blinkR: 0, jawOpen: 0, gazeX: 0, gazeY: 0, breath: 0 };

export function withDefaults(p = {}) {
  return { ...DEFAULTS, ...EXPRESSION_DEFAULTS, ...p };
}
