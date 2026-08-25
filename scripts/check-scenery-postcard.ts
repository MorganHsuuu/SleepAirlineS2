import assert from 'node:assert/strict';
import {
  buildSceneryPrompt,
  DEFAULT_SCENERY_IMAGE_MODEL,
  DEFAULT_SCENERY_IMAGE_QUALITY,
} from '../src/lib/ai/scenery';

const prompt = buildSceneryPrompt('Marrakech', 'Morocco', 'Marrakech, Morocco');

assert.equal(DEFAULT_SCENERY_IMAGE_MODEL, 'gpt-image-2');
assert.equal(DEFAULT_SCENERY_IMAGE_QUALITY, 'low');
assert.match(prompt, /dimensional travel postcard/i);
assert.match(prompt, /destination-specific color palette/i);
assert.match(prompt, /terrain/i);
assert.match(prompt, /local architecture/i);
assert.doesNotMatch(prompt, /Pixar/i);
assert.doesNotMatch(prompt, /warm gold, peach, fresh morning-blue/i);

console.log('✓ 降落圖使用快速 gpt-image-2 與目的地專屬立體明信片 prompt');
