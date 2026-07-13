const assert = require('assert');

const {
  DEFAULT_LABEL_NUM_PREDICT,
  DEFAULT_TASK_NUM_PREDICT,
  DEFAULT_SMART_BODY_NUM_PREDICT,
  DEFAULT_TITLE_NUM_PREDICT,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
  extractExistingChecklistItems,
  extractSuggestedAnswerFromContent,
  extractSuggestedAttachmentsFromContent,
  extractSuggestedDueDateFromContent,
  extractSuggestedLabelReferencesFromContent,
  extractSuggestedMarkdownBodyFromContent,
  extractSuggestedTasksFromContent,
  extractSuggestedTitleFromContent,
  listOllamaModels,
  normalizeOllamaBaseUrl,
  normalizeOllamaModelList,
  normalizeSmartCardActionTarget,
  normalizeSuggestedTaskItems,
  runSmartCardActionWithOllama,
  suggestCardTasksWithOllama,
} = require('../lib/aiTaskSuggestions');

async function run() {
  assert.strictEqual(normalizeOllamaBaseUrl('localhost:11434/'), 'http://localhost:11434');
  assert.strictEqual(buildOllamaChatUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434/api/chat');
  assert.strictEqual(buildOllamaTagsUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434/api/tags');

  assert.deepStrictEqual(normalizeOllamaModelList([
    { name: 'llama3.2:latest', size: 123 },
    { model: 'qwen2.5:7b', details: { parameter_size: '7.6B' } },
    { name: 'llama3.2:latest' },
    {},
  ]).map((model) => model.name), [
    'llama3.2:latest',
    'qwen2.5:7b',
  ]);

  assert.deepStrictEqual(normalizeSuggestedTaskItems([
    '- [ ] Confirm venue',
    '1. Confirm venue',
    '* Draft invitation',
    '',
  ], { maxTasks: 6 }), [
    'Confirm venue',
    'Draft invitation',
  ]);

  assert.deepStrictEqual(extractExistingChecklistItems(`
- [ ] Book room
- [x] Send email
Not a task
  `), [
    'Book room',
    'Send email',
  ]);

  assert.deepStrictEqual(extractSuggestedTasksFromContent(JSON.stringify([
    { title: 'Confirm guest count' },
    { task: '- [ ] Order refreshments' },
  ]), { maxTasks: 6 }), [
    'Confirm guest count',
    'Order refreshments',
  ]);

  assert.deepStrictEqual(extractSuggestedTasksFromContent(JSON.stringify({
    tasks: [],
    task_list: [
      { text: 'Draft agenda' },
      { action: 'Reserve meeting room' },
    ],
  }), { maxTasks: 6 }), [
    'Draft agenda',
    'Reserve meeting room',
  ]);

  assert.deepStrictEqual(extractSuggestedTasksFromContent(`
Here are useful tasks:
- [ ] Confirm venue
1. Send invitations
  `, { maxTasks: 6 }), [
    'Confirm venue',
    'Send invitations',
  ]);
  assert.strictEqual(extractSuggestedTitleFromContent('{"title":"Plan camping meals"}'), 'Plan camping meals');
  assert.strictEqual(extractSuggestedMarkdownBodyFromContent('{"body":"## Summary\\n\\nKeep the full details."}'), '## Summary\n\nKeep the full details.');
  assert.strictEqual(extractSuggestedAnswerFromContent('{"answer":"The remaining work is QA and publish prep."}'), 'The remaining work is QA and publish prep.');
  assert.deepStrictEqual(extractSuggestedLabelReferencesFromContent('{"labels":["Launch",{"name":"Content"},"Launch"]}'), [
    'Launch',
    'Content',
  ]);
  assert.strictEqual(extractSuggestedDueDateFromContent('{"due":"2026-08-14"}'), '2026-08-14');
  assert.strictEqual(extractSuggestedDueDateFromContent('{"due":"August 14"}'), '');
  assert.deepStrictEqual(extractSuggestedAttachmentsFromContent(JSON.stringify({
    attachments: [
      { type: 'url', url: 'https://example.com/spec', title: 'Spec' },
      { type: 'app-link', url: 'obsidian://open?vault=Main&file=Note', title: 'Note' },
      { type: 'url', url: 'file:///tmp/private.txt' },
    ],
  })), [
    { type: 'url', title: 'Spec', url: 'https://example.com/spec' },
    { type: 'app-link', title: 'Note', url: 'obsidian://open?vault=Main&file=Note' },
  ]);
  assert.strictEqual(normalizeSmartCardActionTarget('due-dates'), 'due');
  assert.strictEqual(normalizeSmartCardActionTarget('tasks'), 'content');

  let capturedRequest = null;
  const result = await suggestCardTasksWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    taskCount: 4,
  }, {
    title: 'Plan launch party',
    body: '- [ ] Book room',
    boardName: 'Marketing',
    listName: 'To-do',
    labels: ['Event'],
  }, {
    currentDate: '2026-06-16',
    fetchImpl: async (url, request) => {
      capturedRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              items: [
                'Confirm guest count',
                '- [ ] Order refreshments',
                'Confirm guest count',
              ],
            }),
          },
        }),
      };
    },
  });

  assert.strictEqual(capturedRequest.url, 'http://127.0.0.1:11434/api/chat');
  const body = JSON.parse(capturedRequest.request.body);
  assert.strictEqual(body.model, 'llama3.2');
  assert.strictEqual(body.stream, false);
  assert.strictEqual(body.think, false);
  assert.strictEqual(body.format, 'json');
  assert.strictEqual(body.options.num_predict, DEFAULT_TASK_NUM_PREDICT);
  assert.deepStrictEqual(result.tasks, [
    'Confirm guest count',
    'Order refreshments',
  ]);
  assert.strictEqual(result.provider, 'ollama');

  let emptySuggestionError = null;
  try {
    await suggestCardTasksWithOllama({
      url: 'http://127.0.0.1:11434',
      model: 'tiny-model',
      taskCount: 4,
    }, {
      title: 'Plan launch party',
    }, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: 'tiny-model',
          message: {
            role: 'assistant',
            content: JSON.stringify({ tasks: [] }),
          },
          done: true,
        }),
      }),
    });
  } catch (error) {
    emptySuggestionError = error;
  }

  assert(emptySuggestionError, 'Expected empty suggestions to throw.');
  assert.strictEqual(emptySuggestionError.code, 'AI_EMPTY_SUGGESTIONS');
  assert.strictEqual(emptySuggestionError.details.model, 'tiny-model');
  assert.strictEqual(emptySuggestionError.details.endpoint, 'http://127.0.0.1:11434/api/chat');
  assert.strictEqual(emptySuggestionError.details.responseContent, JSON.stringify({ tasks: [] }));
  assert.deepStrictEqual(emptySuggestionError.details.response.message, {
    role: 'assistant',
    content: JSON.stringify({ tasks: [] }),
  });

  let thinkingOnlyError = null;
  try {
    await suggestCardTasksWithOllama({
      url: 'http://127.0.0.1:11434',
      model: 'thinking-model',
      taskCount: 4,
    }, {
      title: 'Shopping list for 3 day camping trip',
    }, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: 'thinking-model',
          message: {
            role: 'assistant',
            content: '',
            thinking: 'Drafting tasks but never reaching the final JSON response.',
          },
          done: true,
          done_reason: 'length',
        }),
      }),
    });
  } catch (error) {
    thinkingOnlyError = error;
  }

  assert(thinkingOnlyError, 'Expected thinking-only response to throw.');
  assert.strictEqual(thinkingOnlyError.code, 'AI_THINKING_RESPONSE_TRUNCATED');
  assert.strictEqual(thinkingOnlyError.details.doneReason, 'length');
  assert.strictEqual(thinkingOnlyError.details.responseHasThinking, true);
  assert.strictEqual(thinkingOnlyError.details.request.think, false);
  assert.strictEqual(thinkingOnlyError.details.request.numPredict, DEFAULT_TASK_NUM_PREDICT);

  let capturedTitleActionRequest = null;
  const titleActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'generate-title',
    type: 'title',
    label: 'Generate new title',
    prompt: 'Improve the title.',
    builtIn: true,
  }, {
    title: 'stuff',
    body: 'Need shopping list for a 3 day camping trip.',
  }, {
    fetchImpl: async (url, request) => {
      capturedTitleActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({ title: 'Plan shopping for 3-day camping trip' }),
          },
        }),
      };
    },
  });
  const titleActionBody = JSON.parse(capturedTitleActionRequest.request.body);
  assert.strictEqual(titleActionBody.think, false);
  assert.strictEqual(titleActionBody.options.num_predict, DEFAULT_TITLE_NUM_PREDICT);
  assert.strictEqual(titleActionResult.actionType, 'title');
  assert.strictEqual(titleActionResult.title, 'Plan shopping for 3-day camping trip');

  let capturedTaskActionRequest = null;
  const taskActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'generate-task-list',
    type: 'tasks',
    label: 'Generate task list',
    prompt: 'Generate tasks.',
    builtIn: true,
  }, {
    title: 'Plan launch party',
  }, {
    fetchImpl: async (url, request) => {
      capturedTaskActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({ tasks: ['Book room', 'Invite team'] }),
          },
        }),
      };
    },
  });
  const taskActionBody = JSON.parse(capturedTaskActionRequest.request.body);
  assert.strictEqual(taskActionBody.options.num_predict, DEFAULT_TASK_NUM_PREDICT);
  assert(taskActionBody.messages[0].content.includes('Follow the action prompt for how many tasks to create.'));
  assert(!taskActionBody.messages[1].content.includes('requestedTaskCount'));
  assert.deepStrictEqual(taskActionResult.tasks, ['Book room', 'Invite team']);

  let capturedSummaryActionRequest = null;
  const summaryActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'generate-summary',
    type: 'summary',
    label: 'Generate card summary',
    prompt: 'Summarize the card.',
    builtIn: true,
  }, {
    title: 'Client request',
    body: 'Client asked for a Friday delivery. The current plan needs design and QA review.',
  }, {
    fetchImpl: async (url, request) => {
      capturedSummaryActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({ body: 'Client asked for Friday delivery and needs design plus QA review.' }),
          },
        }),
      };
    },
  });
  const summaryActionBody = JSON.parse(capturedSummaryActionRequest.request.body);
  assert.strictEqual(summaryActionBody.options.num_predict, DEFAULT_SMART_BODY_NUM_PREDICT);
  assert(summaryActionBody.messages[0].content.includes('do not include the generated-summary end marker'));
  assert.strictEqual(summaryActionResult.actionType, 'summary');
  assert(summaryActionResult.body.includes('Client asked for Friday delivery'));

  let capturedLabelActionRequest = null;
  const labelActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'auto-label-card',
    type: 'labels',
    label: 'Auto-label card',
    prompt: 'Choose labels.',
    builtIn: true,
  }, {
    title: 'Plan release notes',
    body: 'Draft launch copy for the next release.',
    labels: ['Launch'],
    availableLabels: [
      { id: 'launch', name: 'Launch' },
      { id: 'content', name: 'Content' },
    ],
    due: '2026-04-05',
  }, {
    fetchImpl: async (url, request) => {
      capturedLabelActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({ labels: ['Content'] }),
          },
        }),
      };
    },
  });
  const labelActionBody = JSON.parse(capturedLabelActionRequest.request.body);
  assert.strictEqual(labelActionBody.options.num_predict, DEFAULT_LABEL_NUM_PREDICT);
  assert(labelActionBody.messages[0].content.includes('Choose only from availableLabels'));
  assert(labelActionBody.messages[1].content.includes('"availableLabels"'));
  assert(labelActionBody.messages[1].content.includes('"due":"2026-04-05"'));
  assert.strictEqual(labelActionResult.actionType, 'labels');
  assert.deepStrictEqual(labelActionResult.labels, ['Content']);

  let capturedQuickDueActionRequest = null;
  const quickDueActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'quick-smart-action',
    type: 'quick',
    target: 'due',
    label: 'Quick Smart Action',
    prompt: 'Choose a due date for this card.',
    builtIn: true,
  }, {
    title: 'Ship launch notes',
    body: 'Publish by the second week of August.',
  }, {
    fetchImpl: async (url, request) => {
      capturedQuickDueActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({ due: '2026-08-14' }),
          },
        }),
      };
    },
  });
  const quickDueActionBody = JSON.parse(capturedQuickDueActionRequest.request.body);
  assert.strictEqual(quickDueActionBody.options.num_predict, DEFAULT_TITLE_NUM_PREDICT);
  assert(quickDueActionBody.messages[0].content.includes('{"due":"YYYY-MM-DD"}'));
  assert(quickDueActionBody.messages[1].content.includes('"target":"due"'));
  assert.strictEqual(quickDueActionResult.actionType, 'due');
  assert.strictEqual(quickDueActionResult.due, '2026-08-14');

  let capturedQuestionActionRequest = null;
  const questionActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'question-card',
    type: 'question',
    target: 'content',
    label: 'Question the Card',
    prompt: 'What is left to do?',
    builtIn: true,
  }, {
    title: 'Ship launch notes',
    body: '- [ ] Finish QA\n- [x] Draft notes',
    cardMarkdown: '---\ntitle: "Ship launch notes"\nlabels: ["Launch"]\n---\n\n- [ ] Finish QA\n- [x] Draft notes',
  }, {
    fetchImpl: async (url, request) => {
      capturedQuestionActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({ answer: 'The remaining visible task is to finish QA.' }),
          },
        }),
      };
    },
  });
  const questionActionBody = JSON.parse(capturedQuestionActionRequest.request.body);
  assert.strictEqual(questionActionBody.options.num_predict, DEFAULT_SMART_BODY_NUM_PREDICT);
  assert(questionActionBody.messages[0].content.includes('{"answer":"Answer text"}'));
  assert(questionActionBody.messages[1].content.includes('"type":"question"'));
  assert(questionActionBody.messages[1].content.includes('"cardMarkdown"'));
  assert.strictEqual(questionActionResult.actionType, 'answer');
  assert.strictEqual(questionActionResult.answer, 'The remaining visible task is to finish QA.');

  let capturedAttachmentActionRequest = null;
  const attachmentActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'custom-links',
    type: 'custom',
    target: 'attachments',
    label: 'Find links',
    prompt: 'Suggest relevant links to attach.',
    builtIn: false,
  }, {
    title: 'Reference material',
    linkedObjects: [
      { type: 'url', title: 'Existing', url: 'https://example.com/existing' },
    ],
  }, {
    fetchImpl: async (url, request) => {
      capturedAttachmentActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({
              attachments: [
                { type: 'url', url: 'https://example.com/new', title: 'New reference' },
              ],
            }),
          },
        }),
      };
    },
  });
  const attachmentActionBody = JSON.parse(capturedAttachmentActionRequest.request.body);
  assert(attachmentActionBody.messages[0].content.includes('Do not return local file paths.'));
  assert(attachmentActionBody.messages[1].content.includes('"linkedObjects"'));
  assert.strictEqual(attachmentActionResult.actionType, 'attachments');
  assert.deepStrictEqual(attachmentActionResult.attachments, [
    { type: 'url', title: 'New reference', url: 'https://example.com/new' },
  ]);

  let capturedPasteActionRequest = null;
  const pasteActionResult = await runSmartCardActionWithOllama({
    url: 'http://127.0.0.1:11434',
    model: 'llama3.2',
  }, {
    id: 'smart-paste',
    type: 'paste',
    label: 'Smart paste',
    prompt: 'Format pasted text.',
    builtIn: true,
  }, {
    title: 'Client request',
  }, {
    pasteText: 'Client asked for a Friday delivery. https://example.com',
    fetchImpl: async (url, request) => {
      capturedPasteActionRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify({ body: '## Summary\n\nClient asked for Friday delivery.\n\n## References\n\n- https://example.com' }),
          },
        }),
      };
    },
  });
  const pasteActionBody = JSON.parse(capturedPasteActionRequest.request.body);
  assert.strictEqual(pasteActionBody.options.num_predict, DEFAULT_SMART_BODY_NUM_PREDICT);
  assert(pasteActionBody.messages[1].content.includes('Client asked for a Friday delivery.'));
  assert.strictEqual(pasteActionResult.actionType, 'paste');
  assert(pasteActionResult.body.includes('Client asked for Friday delivery.'));

  let capturedTagsRequest = null;
  const modelList = await listOllamaModels({
    url: 'http://127.0.0.1:11434',
  }, {
    fetchImpl: async (url, request) => {
      capturedTagsRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [
            { name: 'llama3.2:latest', details: { parameter_size: '3.2B' } },
            { model: 'qwen2.5:7b' },
          ],
        }),
      };
    },
  });

  assert.strictEqual(capturedTagsRequest.url, 'http://127.0.0.1:11434/api/tags');
  assert.strictEqual(capturedTagsRequest.request.method, 'GET');
  assert.deepStrictEqual(modelList.models.map((model) => model.name), [
    'llama3.2:latest',
    'qwen2.5:7b',
  ]);

  console.log('AI task suggestion tests passed.');
}

run().catch((error) => {
  console.error('AI task suggestion tests failed.');
  console.error(error);
  process.exitCode = 1;
});
