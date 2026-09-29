import { expect, it } from 'vitest';
import { readableScale, visibleArea } from './viewport-area';
const rect = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }) as DOMRect;
it('centers in space above sheets and beside sidebars, without counting unrelated panels', () => {
  expect(visibleArea(rect(0, 100, 390, 680), [rect(0, 480, 390, 300)])).toEqual({ width: 390, height: 380 });
  expect(visibleArea(rect(0, 100, 1440, 800), [rect(1050, 56, 390, 844)])).toEqual({ width: 1050, height: 800 });
  expect(visibleArea(rect(0, 100, 1080, 800), [rect(1080, 100, 360, 800)])).toEqual({ width: 1080, height: 800 });
});
it('protects 12px text without enlarging an already readable fit', () => {
  expect(readableScale(.2, 16)).toBe(.75);
  expect(readableScale(.9, 16)).toBe(.9);
  expect(readableScale(.2, 13.12) * 13.12).toBeCloseTo(12);
});
