import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCut, inkBounds, packInk, simplifyInk, splitAtPageEdges } from '../src/drawing.ts';

test('a gesture crossing the spine stays with both pages, including interpolated pressure', () => {
  const parts = splitAtPageEdges([[-20, 30, 0.2], [20, 50, 0.8]], 'both');
  assert.deepEqual(parts, [
    { side: 'left', points: [[-20, 30, 0.2], [0, 40, 0.5]] },
    { side: 'right', points: [[0, 40, 0.5], [20, 50, 0.8]] }
  ]);
  assert.deepEqual(splitAtPageEdges([[0, 20]], 'both'), [{ side: 'right', points: [[0, 20]] }]);
  assert.deepEqual(splitAtPageEdges([[8, -1]], 'right'), []);
  assert.deepEqual(splitAtPageEdges([[-3, 2], [3, 2], [-3, 6]], 'left'), [
    { side: 'left', points: [[-3, 2], [0, 2]] }, { side: 'left', points: [[0, 4], [-3, 6]] }
  ]);
});

test('leaving the top edge does not connect marks across empty paper on re-entry', () => {
  assert.deepEqual(splitAtPageEdges([[10, 10], [20, -10], [40, -10], [50, 10]], 'right'), [
    { side: 'right', points: [[10, 10], [15, 0]] }, { side: 'right', points: [[45, 0], [50, 10]] }
  ]);
});

test('straight samples compact to endpoints while corners and changes of pen pressure survive', () => {
  const line = Array.from({ length: 500 }, (_, i) => [i / 4, 18]);
  assert.deepEqual(simplifyInk(line, 0.4, 5), [line[0], line.at(-1)]);
  const tip = [[0, 4, 0.2], [20, 4, 1], [40, 4, 0.2], [42, 25, 0.2]];
  assert.deepEqual(simplifyInk(tip, 0.4, 10), tip);
});

test('stroke geometry and eraser marks are local to the page anchor', () => {
  const b = packInk({ side: 'left', points: [[-150, 20], [-50, 20]] }, 'pen', 8, '#111111', 'one');
  assert.deepEqual(b.ink.points, [[0, 0], [100, 0]]);
  assert.deepEqual(inkBounds(b.ink), { x: -5, y: -5, w: 110, h: 10 });
  const cuts = [];
  assert.equal(addCut(b, [-100, -25], [-100, 70], 4, cuts), true);
  assert.deepEqual(cuts, [{ size: 4, points: [[50, -45], [50, 50]] }]);
  const moved = { ...b, x: b.x + 850 };
  const next = [];
  addCut(moved, [750, -25], [750, 70], 4, next);
  assert.deepEqual(next, cuts);
});

test('an eraser dot and an edge graze are recorded, disjoint passes stay separate and misses stay empty', () => {
  const b = packInk({ side: 'right', points: [[10, 30], [110, 30]] }, 'marker', 30, '#bbaa77', 'two');
  const cuts = [];
  assert.equal(addCut(b, [20, 45], [20, 45], 2, cuts), true);
  assert.equal(addCut(b, [20, 45], [30, 45], 2, cuts), true);
  assert.equal(addCut(b, [95, 29], [95, 35], 2, cuts), true);
  assert.equal(addCut(b, [5, 60], [145, 60], 10, cuts), false);
  assert.deepEqual(cuts, [{ size: 2, points: [[10, 15], [20, 15]] }, { size: 2, points: [[85, -1], [85, 5]] }]);
});
