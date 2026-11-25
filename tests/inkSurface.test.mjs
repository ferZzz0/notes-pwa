import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InkSurface } from '../src/inkSurface.ts';

// Count mask composites so the camera tests do not depend on frame timing.
class RecordingCanvas extends EventTarget {
  width = 1;
  height = 1;
  style = {};
  composites = 0;

  getContext() {
    return {
      canvas: this,
      drawImage: () => { this.composites++; },
      save() {}, restore() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {},
      setTransform() {}, translate() {}, stroke() {}, fill() {}
    };
  }
}

test('zoom reuses erased strokes, and refines only the visible ink at the new scale', t => {
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.document = { createElement: () => new RecordingCanvas() };
  globalThis.Path2D = class { moveTo() {} lineTo() {} arc() {} };
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Path2D;
  });

  const canvas = new RecordingCanvas();
  let lost = false;
  const surface = new InkSurface(canvas.getContext(), () => { lost = true; });
  t.after(() => surface.dispose());
  const ink = { brush: 'pen', size: 8, points: [[0, 0], [60, 0]], cuts: [{ size: 5, points: [[20, 0]] }] };
  const near = { id: 'near', x: 100, y: 100, color: '#123456', ink };
  const blocks = [near, { ...near, id: 'far', y: 12000 }];
  const home = { x: 0, y: 0, w: 320, h: 480 };
  const zoom = { x: 80, y: 70, w: 100, h: 150 };

  assert.ok(surface.prepare(blocks, home, 1, 0.25));
  const lowWidth = canvas.width;
  assert.equal(canvas.composites, 1);
  assert.ok(surface.prepare(blocks, { ...home, x: 30 }, 1, 0.25));
  assert.ok(surface.covers(zoom));
  assert.equal(surface.covers(zoom, 3), false);
  assert.equal(canvas.composites, 1);

  assert.ok(surface.prepare(blocks, zoom, 3, 0.25));
  assert.ok(surface.covers(zoom, 3));
  assert.ok(canvas.width >= lowWidth * 3 - 2);
  assert.equal(canvas.composites, 2);
  const updated = [{ ...near, ink: { ...ink, cuts: [...ink.cuts, { size: 7, points: [[30, 0]] }] } }, blocks[1]];
  assert.ok(surface.prepare(updated, zoom, 3, 0.25));
  assert.equal(canvas.composites, 3);

  const empty = { ...zoom, y: 5000 };
  assert.equal(surface.prepare(updated, empty, 3, 0.25), false);
  assert.ok(surface.covers(empty, 3));
  assert.equal(canvas.width * canvas.height, 1);
  assert.ok(surface.prepare(updated, { ...zoom, y: 11970 }, 3, 0.25));
  assert.equal(canvas.composites, 4);
  canvas.dispatchEvent(new Event('contextlost'));
  assert.ok(lost);
  assert.equal(surface.covers({ ...zoom, y: 11970 }), false);
});
