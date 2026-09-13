import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationPicker } from './ApplicationPicker.ts';

test('picker lists discovered window titles as text nodes and binds by id', async () => {
  const bound: string[] = [];
  const nodes: Array<{ textContent: string; windowId: string }> = [];
  const picker = new ApplicationPicker({
    search: async () => ({
      status: 'available',
      windows: [
        { id: 'window:fixture-one', title: 'Document One', application: 'Host A' },
        { id: 'window:fixture-two', title: 'Document Two', application: 'Host B' },
      ],
    }),
    bind: async windowId => { bound.push(windowId); },
    render: items => {
      nodes.length = 0;
      for (const item of items) nodes.push({ textContent: item.label, windowId: item.windowId });
    },
  });
  await picker.refresh();
  assert.deepEqual(nodes.map(n => n.windowId), ['window:fixture-one', 'window:fixture-two']);
  assert.equal(nodes[0]!.textContent, 'Document One · Host A');
  assert.equal(nodes[0]!.textContent.includes('<'), false);
  await picker.bind('window:fixture-two');
  assert.deepEqual(bound, ['window:fixture-two']);
});
