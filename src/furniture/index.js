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
import { wall, wallWainscot, wallSlat, wallMirror, wallFoam, wallPaper, wallBrick } from '../architecture/walls.js';
import { wallDoor } from '../architecture/door.js';
import { wallWindow } from '../architecture/window.js';
import { floorHerringbone, floorPlank, floorTerrazzo, floorHex, floorDeck, floorChecker, floorCement, floorRubber, floorBrick, floorPaint, floorCarpet, floorConcrete, floorCork } from '../architecture/floors.js';
import { railing } from '../architecture/railing.js';
import kitchenBase from '../kitchen/base.js';
import kitchenWall from '../kitchen/wall.js';
import kitchenIsland from '../kitchen/island.js';
import toilet from '../bathroom/toilet.js';
import vanity from '../bathroom/vanity.js';
import shower from '../bathroom/shower.js';
import loungeChair from '../balcony/lounge-chair.js';
import gardenStool from '../balcony/stool.js';
import oliveTree from '../balcony/olive.js';
import libraryWall from '../study/library.js';
import readingChair from '../study/reading-chair.js';
import readingLamp from '../study/reading-lamp.js';
import shoeCabinet from '../entry/shoe-cabinet.js';
import floorMirror from '../entry/floor-mirror.js';
import coatStand from '../entry/coat-stand.js';
import kidsBed from '../kids/bed.js';
import toyCabinet from '../kids/toy-cabinet.js';
import kidsDesk from '../kids/desk.js';
import washer from '../laundry/washer.js';
import dryer from '../laundry/dryer.js';
import dryingRack from '../laundry/drying-rack.js';
import openWardrobe from '../closet/wardrobe.js';
import dressingTable from '../closet/dressing-table.js';
import jewelryIsland from '../closet/jewelry-island.js';
import treadmill from '../gym/treadmill.js';
import dumbbellRack from '../gym/dumbbell-rack.js';
import yogaMat from '../gym/yoga-mat.js';
import grandPiano from '../music/grand-piano.js';
import musicStand from '../music/music-stand.js';
import pianoBench from '../music/piano-bench.js';
import teaTable from '../tea/tea-table.js';
import teaCushion from '../tea/cushion.js';
import curioShelf from '../tea/curio-shelf.js';
import projectorScreen from '../theater/screen.js';
import theaterSofa from '../theater/sofa.js';
import towerSpeaker from '../theater/speaker.js';
import spinBike from '../gym2/spin-bike.js';
import rowingMachine from '../gym2/rower.js';
import cableCrossover from '../gym2/cable-crossover.js';
import poolTable from '../game/pool-table.js';
import arcadeCabinet from '../game/arcade.js';
import foosballTable from '../game/foosball.js';
import neonSign from '../game/neon-sign.js';
import easel from '../studio/easel.js';
import artCart from '../studio/art-cart.js';
import stillLife from '../studio/still-life.js';
import drumKit from '../band/drum-kit.js';
import electricGuitar from '../band/guitar.js';
import guitarAmp from '../band/amp.js';
import micStand from '../band/mic-stand.js';
import workbench from '../workshop/workbench.js';
import pegboard from '../workshop/pegboard.js';
import toolChest from '../workshop/tool-chest.js';
import sawhorses from '../workshop/sawhorses.js';
import catTree from '../pets/cat-tree.js';
import aquarium from '../pets/aquarium.js';
import dogBed from '../pets/dog-bed.js';
import petFeeder from '../pets/pet-feeder.js';
import sewingTable from '../sewing/sewing-table.js';
import dressForm from '../sewing/dress-form.js';
import threadRack from '../sewing/thread-rack.js';
import cuttingTable from '../sewing/cutting-table.js';
import barCounter from '../bar/bar-counter.js';
import backBar from '../bar/back-bar.js';
import barCart from '../bar/bar-cart.js';
import wineRack from '../bar/wine-rack.js';

// 清单（顺序即展示顺序）：家具、摆件（category: 'decor'）、灯具（category: 'lighting'）、
// 墙地门窗（category: 'architecture'，可拼接的建筑构件）、厨房（category: 'kitchen'）、浴室（category: 'bathroom'）、
// 阳台（category: 'balcony'）、书房（category: 'study'）、玄关（category: 'entry'）、儿童房（category: 'kids'）、
// 洗衣房（category: 'laundry'）、衣帽间（category: 'closet'）、健身房（category: 'gym'）、书房二 / 琴房（category: 'music'）、
// 茶室（category: 'tea'）、影音室（category: 'theater'）、健身房二（category: 'gym2'）、游戏室（category: 'game'）、画室（category: 'studio'）、
// 排练室（category: 'band'）、木工房（category: 'workshop'）、宠物房（category: 'pets'）、缝纫间（category: 'sewing'）、
// 酒吧（category: 'bar'）
export const FURNITURE = [
  chair, table, sofa, armchair, coffeeTable, bookshelf, nightstand, bed, barStool, wardrobe, desk, officeChair,
  sideboard, bench, sideTable,
  books, vases, fiddleFig, snakePlant, rug,
  floorLamp, tableLamp, pendant, wallLamp,
  wall, wallWainscot, wallDoor, wallWindow, floorHerringbone, floorPlank, floorTerrazzo, floorHex, floorDeck, railing, floorChecker, floorCement, floorRubber, floorBrick, wallSlat, wallMirror, floorPaint, wallFoam, floorCarpet, floorConcrete, floorCork, wallPaper, wallBrick,
  kitchenBase, kitchenWall, kitchenIsland,
  vanity, toilet, shower,
  loungeChair, gardenStool, oliveTree,
  libraryWall, readingChair, readingLamp,
  shoeCabinet, floorMirror, coatStand,
  kidsBed, toyCabinet, kidsDesk,
  washer, dryer, dryingRack,
  openWardrobe, dressingTable, jewelryIsland,
  treadmill, dumbbellRack, yogaMat,
  grandPiano, musicStand, pianoBench,
  teaTable, teaCushion, curioShelf,
  projectorScreen, theaterSofa, towerSpeaker,
  spinBike, rowingMachine, cableCrossover,
  poolTable, arcadeCabinet, foosballTable, neonSign,
  easel, artCart, stillLife,
  drumKit, electricGuitar, guitarAmp, micStand,
  workbench, pegboard, toolChest, sawhorses,
  catTree, aquarium, dogBed, petFeeder,
  sewingTable, dressForm, threadRack, cuttingTable,
  barCounter, backBar, barCart, wineRack,
];
