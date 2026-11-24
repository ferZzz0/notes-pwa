import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCut, inkBounds, packInk, simplifyInk, splitAtPageEdges } from '../src/drawing.ts';
import { cutEvidence } from '../src/inkCoverage.ts';

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

test('sparse long strokes, pressure strokes and repeated cuts can be classified without a raster scan', () => {
  const b = packInk({ side: 'right', points: [[5, 50], [905, 50]] }, 'marker', 20, '#665522', 'm');
  const crossing = { size: 8, points: [[701, -60], [701, 45]] };
  assert.equal(cutEvidence(b, [crossing], 2), 'partial');
  const cut = { ...b, ink: { ...b.ink, cuts: [crossing] } };
  assert.equal(cutEvidence(cut, [{ size: 4, points: [[701, 35], [701, -5]] }], 2), 'miss');
  assert.equal(cutEvidence(cut, [{ size: 4, points: [[399, 0]] }], 2), 'partial');

  const dot = packInk({ side: 'left', points: [[-10, 30, 0.6]] }, 'brush', 24, '#112233', 'd');
  assert.equal(cutEvidence(dot, [{ size: 18, points: [[0, 0]] }], 2), 'empty');
});

test('an edge graze or hidden centre is not interpreted as a fully erased stroke', () => {
  const b = packInk({ side: 'right', points: [[40, 70], [640, 70]] }, 'marker', 34, '#ddbb33', 'm');
  const edge = { size: 5, points: [[35, 16], [593, 16]] };
  assert.deepEqual(cutEvidence(b, [edge], 2), { changed: false, remains: true });
  const slit = { ...b, ink: { ...b.ink, cuts: [{ size: 12, points: [[0, 0], [600, 0]] }] } };
  assert.equal(typeof cutEvidence(slit, [edge], 2), 'object');
});

test('a larger eraser over an already invisible older dot requires a visible hit before removal', () => {
  const b = packInk({ side: 'left', points: [[-20, 41]] }, 'pen', 5, '#182030', 'old');
  b.ink.cuts = [{ size: 9, points: [[0, 0], [141, 3]] }];
  assert.deepEqual(cutEvidence(b, [{ size: 14, points: [[0, 0], [18, 6]] }], 2), { changed: false, remains: false });
});
