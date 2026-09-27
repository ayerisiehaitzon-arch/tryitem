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
import sideboard from './sideboard.js';
import bench from './bench.js';
import sideTable from './side-table.js';
import books from '../decor/books.js';
import vases from '../decor/vases.js';
import { fiddleFig, snakePlant } from '../decor/plants.js';
import rug from '../decor/rug.js';
import tableLamp from '../lighting/table-lamp.js';
import pendant from '../lighting/pendant.js';
import wallLamp from '../lighting/wall-lamp.js';
import { wall, wallWainscot } from '../architecture/walls.js';
import { wallDoor } from '../architecture/door.js';
import { wallWindow } from '../architecture/window.js';
import { floorHerringbone, floorPlank, floorTerrazzo, floorHex } from '../architecture/floors.js';
import kitchenBase from '../kitchen/base.js';
import kitchenWall from '../kitchen/wall.js';
import kitchenIsland from '../kitchen/island.js';
import toilet from '../bathroom/toilet.js';
import vanity from '../bathroom/vanity.js';
import shower from '../bathroom/shower.js';

// 清单（顺序即展示顺序）：家具、摆件（category: 'decor'）、灯具（category: 'lighting'）、
// 墙地门窗（category: 'architecture'，可拼接的建筑构件）、厨房（category: 'kitchen'）、浴室（category: 'bathroom'）
export const FURNITURE = [
  chair, table, sofa, armchair, coffeeTable, bookshelf, nightstand, bed, barStool, wardrobe, desk, officeChair,
  sideboard, bench, sideTable,
  books, vases, fiddleFig, snakePlant, rug,
  floorLamp, tableLamp, pendant, wallLamp,
  wall, wallWainscot, wallDoor, wallWindow, floorHerringbone, floorPlank, floorTerrazzo, floorHex,
  kitchenBase, kitchenWall, kitchenIsland,
  vanity, toilet, shower,
];
