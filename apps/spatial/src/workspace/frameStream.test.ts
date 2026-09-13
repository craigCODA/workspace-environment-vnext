import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptFrameSequence, presentCaptureStatus } from './frameStream.ts';

test('latest-frame sequencing rejects stale and out-of-order frames', () => {
  assert.equal(acceptFrameSequence(0, 1), 1);
  assert.equal(acceptFrameSequence(4, 5), 5);
  assert.equal(acceptFrameSequence(5, 5), null);
  assert.equal(acceptFrameSequence(5, 3), null);
  assert.equal(acceptFrameSequence(5, 0), null);
});

test('a waiting capture epoch resets the sequence so a new stream can start at 1', () => {
  assert.equal(acceptFrameSequence(50, 1, { reset: true }), 1);
  assert.equal(acceptFrameSequence(0, 1, { reset: true }), 1);
});

test('host capture headers map to explicit surface presentation states', () => {
  assert.equal(presentCaptureStatus('unbound', false), 'unbound');
  assert.equal(presentCaptureStatus('waiting_for_frame', false), 'waiting');
  assert.equal(presentCaptureStatus('live', true), 'live');
  assert.equal(presentCaptureStatus('idle', true), 'live');
  assert.equal(presentCaptureStatus('idle', false), 'waiting');
  assert.equal(presentCaptureStatus('window_minimized', true), 'minimized');
  assert.equal(presentCaptureStatus('window_missing_or_ambiguous', false), 'missing');
  assert.equal(presentCaptureStatus('capture_protected', false), 'protected');
  assert.equal(presentCaptureStatus('capture_unavailable', false), 'unavailable');
  assert.equal(presentCaptureStatus('capture_limit', false), 'unavailable');
  assert.equal(presentCaptureStatus('platform_unavailable', false), 'unavailable');
});
