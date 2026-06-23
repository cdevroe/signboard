const assert = require('assert');

const {
  DEFAULT_TASK_NUM_PREDICT,
  DEFAULT_SMART_BODY_NUM_PREDICT,
  DEFAULT_TITLE_NUM_PREDICT,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
  extractExistingChecklistItems,
  extractSuggestedMarkdownBodyFromContent,
  extractSuggestedTasksFromContent,
  extractSuggestedTitleFromContent,
  listOllamaModels,
  normalizeOllamaBaseUrl,
  normalizeOllamaModelList,
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
    taskCount: 4,
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
    taskCount: 4,
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
  assert.deepStrictEqual(taskActionResult.tasks, ['Book room', 'Invite team']);

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
