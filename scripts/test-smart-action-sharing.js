const assert = require('assert');
const {
  SMART_ACTION_SHARE_FRAGMENT_PREFIX,
  buildSmartActionShareUrl,
  createSmartActionPackage,
  decodeSmartActionPackage,
  getSmartActionFileName,
  normalizeSmartActionPackage,
} = require('../lib/smartActionSharing');

function run() {
  const boardPackage = createSmartActionPackage('board', {
    label: 'Weekly résumé 🚀',
    description: 'Summarize this board.',
    mode: 'changes',
    capabilities: ['add-labels', 'archive-card', 'not-real'],
    prompt: 'Review the board and suggest useful labels.',
  });
  assert.deepStrictEqual(boardPackage.action.capabilities, ['add-labels', 'archive-card']);
  const shareUrl = buildSmartActionShareUrl('board', {
    label: boardPackage.action.name,
    description: boardPackage.action.description,
    mode: boardPackage.action.mode,
    capabilities: boardPackage.action.capabilities,
    prompt: boardPackage.action.prompt,
  });
  assert(shareUrl.startsWith('https://cdevroe.com/signboard/smart-actions/#signboard-action-v1:'));
  const fragment = shareUrl.split('#')[1];
  const decoded = decodeSmartActionPackage(fragment);
  assert.deepStrictEqual(decoded, boardPackage);
  assert.strictEqual(getSmartActionFileName(decoded), 'weekly-resume.signboard-action');

  const cardPackage = normalizeSmartActionPackage({
    format: 'signboard-smart-action',
    version: 1,
    scope: 'card',
    action: { name: 'Draft follow-up', target: 'labels', prompt: 'Choose useful labels.' },
  });
  assert.strictEqual(cardPackage.action.target, 'labels');
  assert.strictEqual(decodeSmartActionPackage(`${SMART_ACTION_SHARE_FRAGMENT_PREFIX}%%%`), null);
  assert.strictEqual(normalizeSmartActionPackage({ format: 'other', version: 1 }), null);
  assert.strictEqual(normalizeSmartActionPackage({
    format: 'signboard-smart-action',
    version: 1,
    scope: 'board',
    action: { name: 'No prompt', prompt: '' },
  }), null);

  console.log('Smart Action sharing tests passed.');
}

try {
  run();
} catch (error) {
  console.error('Smart Action sharing tests failed.');
  console.error(error);
  process.exitCode = 1;
}
