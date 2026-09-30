import { xf } from '../core/vec.js';

// 地板模块：2m × 2m（四周各多 1mm 重叠），上表面在 y = 0（家具直接放上去），厚 2cm。
//   · 贴图周期整除 2m（人字拼 1m、宽板 2m、水磨石 1m、六角马赛克 1m、户外地板 2m、棋盘格 2m、水泥花砖 2m、橡胶地垫 2m、方砖 2m），UV 以模块中心为原点、不加随机偏移 ——
//     模块按 2m 网格摆放，板缝、铜条在模块之间严丝合缝地接上；
//   · 几何只有一个盒子（底面贴着楼板看不见，不生成）：板缝的倒角槽、年轮、石子全在贴图里；
//   · 一整块平面没有可烘焙的 AO，也不需要接触阴影：两样都不带。
function floorModule({ id, name, nameEn, mat }) {
  return {
    id, name, nameEn,
    category: 'architecture',
    ao: false, shadow: false,
    view: { el: 50, az: 24 },
    build(k) {
      // 四周各多出 1mm：相邻模块重叠 2mm，盖住 GPU 浮点误差在接缝上漏出的亚像素裂缝（重叠处是同一张对齐的贴图）
      k.box({ name: 'floor', mat, size: [2.002, 0.02, 2.002], segs: 0, omit: ['ny'], xf: xf({ pos: [0, -0.01, 0] }) });
    },
  };
}

export const floorHerringbone = floorModule({ id: 'floor_herringbone', name: '人字拼地板', nameEn: 'Oak Herringbone Floor', mat: 'floor_oak' });
export const floorPlank = floorModule({ id: 'floor_plank', name: '宽板地板', nameEn: 'Smoked Oak Plank Floor', mat: 'floor_smoked' });
export const floorTerrazzo = floorModule({ id: 'floor_terrazzo', name: '水磨石地面', nameEn: 'Terrazzo Floor', mat: 'terrazzo' });
export const floorHex = floorModule({ id: 'floor_hex', name: '六角马赛克地面', nameEn: 'Hex Marble Mosaic Floor', mat: 'floor_hex' });
export const floorDeck = floorModule({ id: 'floor_deck', name: '户外地板', nameEn: 'Teak Decking', mat: 'deck' });
export const floorChecker = floorModule({ id: 'floor_checker', name: '棋盘格大理石地面', nameEn: 'Checkerboard Marble Floor', mat: 'floor_checker' });
export const floorCement = floorModule({ id: 'floor_cement', name: '水泥花砖地面', nameEn: 'Encaustic Cement Tile Floor', mat: 'floor_cement' });
export const floorRubber = floorModule({ id: 'floor_rubber', name: '橡胶地垫', nameEn: 'Rubber Gym Flooring', mat: 'floor_rubber' });
export const floorBrick = floorModule({ id: 'floor_brick', name: '方砖地面', nameEn: 'Grey Clay Square Tile Floor', mat: 'floor_brick' });
export const floorPaint = floorModule({ id: 'floor_paint', name: '溅满颜料的木地板', nameEn: 'Paint-Splattered Plank Floor', mat: 'floor_paint' });
export const floorCarpet = floorModule({ id: 'floor_carpet', name: '地毯拼块地面', nameEn: 'Carpet Tile Floor', mat: 'floor_carpet' });
export const floorConcrete = floorModule({ id: 'floor_concrete', name: '水泥地面', nameEn: 'Sealed Concrete Floor', mat: 'floor_concrete' });
export const floorCork = floorModule({ id: 'floor_cork', name: '软木地板', nameEn: 'Cork Tile Floor', mat: 'floor_cork' });
export const floorDiamond = floorModule({ id: 'floor_diamond', name: '花纹钢板地面', nameEn: 'Aluminium Diamond Plate Floor', mat: 'floor_diamond' });
export const floorTerracotta = floorModule({ id: 'floor_terracotta', name: '陶土六角砖地面', nameEn: 'Terracotta Hexagon Tile Floor', mat: 'floor_terracotta' });
