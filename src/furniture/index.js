import chair from './chair.js';
import table from './table.js';
import coffeeTable from './coffee-table.js';
import sofa from './sofa.js';
import armchair from './armchair.js';
import bookshelf from './bookshelf.js';
import nightstand from './nightstand.js';
import bed from './bed.js';
import floorLamp from '../lighting/floor-lamp.js';
import barStool from './bar-stool.js';
import wardrobe from './wardrobe.js';
import desk from './desk.js';
import officeChair from './office-chair.js';
import books from '../decor/books.js';
import vases from '../decor/vases.js';
import { fiddleFig, snakePlant } from '../decor/plants.js';
import rug from '../decor/rug.js';
import tableLamp from '../lighting/table-lamp.js';
import pendant from '../lighting/pendant.js';
import wallLamp from '../lighting/wall-lamp.js';

// 清单（顺序即展示顺序）：家具、摆件（category: 'decor'）、灯具（category: 'lighting'）
export const FURNITURE = [
  chair, table, sofa, armchair, coffeeTable, bookshelf, nightstand, bed, barStool, wardrobe, desk, officeChair,
  books, vases, fiddleFig, snakePlant, rug,
  floorLamp, tableLamp, pendant, wallLamp,
];
