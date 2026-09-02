const assert = require('assert');
const {
  decodeHtmlEntities,
  extractReleaseNotes,
  formatReleaseNotesForDialog,
  normalizeHtmlReleaseNotes,
  stripReleaseNotesSection,
} = require('../lib/updateReleaseNotes');

function run() {
  const windowsGithubHtml = [
    '<h2>What\'s New</h2>',
    '<ul>',
    '<li><strong>New:</strong> Smart Actions: Generate titles, summaries, task lists, labels, due dates, linked-object suggestions, one-off prompts, custom actions, and read-only card questions using local LLMs.</li>',
    '<li><strong>New:</strong> Start dates! Thanks <a class="user-mention" href="https://github.com/semhaj">@semhaj</a>.</li>',
    '<li><strong>New:</strong> Bottom workspace dock for Planner, Kanban, and Table views.</li>',
    '<li>Cleaner labels &amp; faster board switching.</li>',
    '</ul>',
    '<h2>Downloads</h2>',
    '<ul>',
    '<li><a href="https://github.com/cdevroe/signboard/releases/download/1.6.0/signboard_1.6.0_win.exe">Download for Windows</a></li>',
    '<li><a href="https://github.com/cdevroe/signboard/releases/download/1.6.0/signboard_1.6.0_mac_universal.dmg">Download for macOS</a></li>',
    '</ul>',
  ].join('\n');

  const formattedHtml = formatReleaseNotesForDialog({ releaseNotes: windowsGithubHtml });
  assert.strictEqual(
    formattedHtml,
    [
      "What's New",
      '• New: Smart Actions: Generate titles, summaries, task lists, labels, due dates, linked-object suggestions, one-off prompts, custom actions, and read-only card questions using local LLMs.',
      '• New: Start dates! Thanks @semhaj.',
      '• New: Bottom workspace dock for Planner, Kanban, and Table views.',
      '• Cleaner labels & faster board switching.',
    ].join('\n'),
    'expected GitHub HTML release notes to become readable native-dialog text',
  );
  assert(!formattedHtml.includes('<'), 'expected opening HTML characters to be removed');
  assert(!formattedHtml.includes('>'), 'expected closing HTML characters to be removed');
  assert(!formattedHtml.includes('Downloads'), 'expected the HTML Downloads section to be removed');
  assert(!formattedHtml.includes('github.com'), 'expected HTML link destinations not to leak into dialog text');

  const formattedMarkdown = formatReleaseNotesForDialog({
    releaseNotes: [
      '## What\'s New',
      '- **Fixed:** Update notes now render as plain text.',
      '- See the [full changelog](https://example.com/changelog).',
      '## Downloads',
      '- [Download for Windows](https://example.com/windows.exe)',
    ].join('\n'),
  });
  assert.strictEqual(
    formattedMarkdown,
    [
      "What's New",
      '• Fixed: Update notes now render as plain text.',
      '• See the full changelog.',
    ].join('\n'),
    'expected Markdown release notes to become readable native-dialog text',
  );

  const arrayNotes = extractReleaseNotes({
    releaseNotes: [
      { version: '1.6.1', note: '<p>Fixed updater notes.</p>' },
      { version: '1.6.0', note: '<p>Previous changes.</p>' },
    ],
  });
  assert(arrayNotes.includes('Version 1.6.1'));
  assert(arrayNotes.includes('Version 1.6.0'));

  assert.strictEqual(decodeHtmlEntities('A &amp; B &#x1F680; &#39;quoted&#39;'), "A & B 🚀 'quoted'");
  assert.strictEqual(
    normalizeHtmlReleaseNotes('<p>Safe</p><script>doBadThing()</script><g-emoji>🚀</g-emoji>'),
    'Safe\n🚀',
    'expected scripts and custom HTML tags to be removed while preserving readable content',
  );
  assert.strictEqual(
    stripReleaseNotesSection('## Downloads\n- One\n\n## Notes\nKeep me', 'Downloads'),
    '## Notes\nKeep me',
  );
  assert.strictEqual(
    formatReleaseNotesForDialog({ releaseNotes: '<p>123456789</p>' }, { maxChars: 5 }),
    '12345\n\n...',
    'expected truncation to occur after markup normalization',
  );
  assert.strictEqual(
    formatReleaseNotesForDialog({
      releaseNotes: '&lt;h2&gt;Encoded&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Still readable&lt;/li&gt;&lt;/ul&gt;',
    }),
    'Encoded\n• Still readable',
    'expected HTML-entity-encoded markup to be normalized too',
  );
  assert.strictEqual(
    formatReleaseNotesForDialog({ releaseNotes: '' }),
    'No changelog details were provided in the release metadata.',
  );

  console.log('Update release-note tests passed.');
}

run();
