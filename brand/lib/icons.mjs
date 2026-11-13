// Small pixel art drawn cell by cell: the keyboard at icon size.
// Same object as the hero illustration (lib/keyboard.mjs), simplified so that
// every cell is chosen: a white case widening toward you, white keys with grey
// fronts, the black spacebar, the orange Enter, a black outline.
import { grid } from './raster.mjs';
import { dropShadow } from './keyboard.mjs';

const KEY = {
  '#': 'outline', w: 'keyTop', g: 'keyFront', G: 'well', W: 'caseTop', F: 'caseFront',
  k: 'darkTop', K: 'darkFront', o: 'accentTop', O: 'accentFront',
};

// 29 x 15 cells. Fits Android's 66 dp safe circle on a 54-cell (2 dp) grid.
// Key fronts share the well's grey, so each row reads as one line of keys.
export const ICON_KEYBOARD = `
  ....#####################....
  ...#WWWWWWWWWWWWWWWWWWWWW#...
  ...#WGGGGGGGGGGGGGGGGGGGW#...
  ...#WGwwGwwGwwGwwGwwGwwGW#...
  ..#WGGGGGGGGGGGGGGGGGGGGGW#..
  ..#WGwwwGwwGwwGwwGwwGwwwGW#..
  .#WGGGGGGGGGGGGGGGGGGGGGGGW#.
  .#WGwwwwGwwGwwGwwGwwGooooGW#.
  #WGGGGGGGGGGGGGGGGGGGOOOOGGW#
  #WGwwwGwwGkkkkkkkkkGwwGwwwGW#
  #WGGGGGGGGKKKKKKKKKGGGGGGGGW#
  #WWWWWWWWWWWWWWWWWWWWWWWWWWW#
  #FFFFFFFFFFFFFFFFFFFFFFFFFFF#
  #FFFFFFFFFFFFFFFFFFFFFFFFFFF#
  .###########################.
`;

export function iconKeyboard({ shadow = [1, 1] } = {}) {
  const r = grid(ICON_KEYBOARD, KEY);
  return shadow ? dropShadow(r, shadow, 'shadow') : r;
}
