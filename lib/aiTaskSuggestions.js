const DEFAULT_OLLAMA_TIMEOUT_MS = 45000;
const DEFAULT_OLLAMA_INSPECT_TIMEOUT_MS = 7000;
const DEFAULT_TASK_COUNT = 6;
const DEFAULT_SMART_ACTION_TASK_RESULT_LIMIT = 30;
const DEFAULT_TASK_NUM_PREDICT = 768;
const DEFAULT_TITLE_NUM_PREDICT = 256;
const DEFAULT_LABEL_NUM_PREDICT = 512;
const DEFAULT_SMART_BODY_NUM_PREDICT = 1800;
const MAX_BODY_CONTEXT_LENGTH = 6000;
const MAX_PASTE_CONTEXT_LENGTH = 12000;
const MAX_TASK_LENGTH = 180;
const MAX_TITLE_LENGTH = 160;
const TASK_COLLECTION_KEYS = [
  'tasks',
  'taskList',
  'task_list',
  'taskItems',
  'task_items',
  'checklist',
  'items',
  'todos',
  'toDos',
  'todoItems',
  'todo_items',
  'suggestions',
  'steps',
  'actions',
  'nextActions',
  'next_actions',
];
const TASK_TEXT_KEYS = [
  'task',
  'title',
  'text',
  'content',
  'name',
  'description',
  'action',
  'item',
  'label',
];
const LABEL_COLLECTION_KEYS = [
  'labels',
  'labelNames',
  'label_names',
  'suggestedLabels',
  'suggested_labels',
  'recommendedLabels',
  'recommended_labels',
];
const LABEL_TEXT_KEYS = [
  'label',
  'name',
  'title',
  'id',
  'text',
  'value',
];
const SMART_CARD_ACTION_TYPES = new Set(['title', 'summary', 'tasks', 'labels', 'paste', 'custom']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactText(value, maxLength = 1000) {
  const text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}\n\n[truncated]`;
}

function normalizeTaskCount(value, fallback = DEFAULT_TASK_COUNT) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isInteger(parsed) && parsed >= 3 && parsed <= 12) {
    return parsed;
  }

  return fallback;
}

function normalizeOllamaBaseUrl(value) {
  let candidate = String(value || '').trim();
  if (!candidate) {
    candidate = 'http://127.0.0.1:11434';
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }

  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ollama URL must use http or https.');
  }

  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';

  const path = parsed.pathname && parsed.pathname !== '/'
    ? parsed.pathname.replace(/\/+$/, '')
    : '';
  return `${parsed.origin}${path}`;
}

function buildOllamaChatUrl(baseUrl) {
  return `${normalizeOllamaBaseUrl(baseUrl)}/api/chat`;
}

function buildOllamaTagsUrl(baseUrl) {
  return `${normalizeOllamaBaseUrl(baseUrl)}/api/tags`;
}

function normalizeSuggestedTaskItem(value) {
  let sourceValue = value;

  if (isObject(value)) {
    sourceValue = '';
    for (const key of TASK_TEXT_KEYS) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        sourceValue = value[key];
        break;
      }
    }
  }

  const task = String(sourceValue || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^[-*+•]\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/^[-*+•]\s+\[[ xX]\]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!task) {
    return '';
  }

  return task.length > MAX_TASK_LENGTH
    ? `${task.slice(0, MAX_TASK_LENGTH - 3).trim()}...`
    : task;
}

function normalizeSuggestedTaskItems(tasks, options = {}) {
  const maxTasks = normalizeTaskCount(options.maxTasks, DEFAULT_TASK_COUNT);
  const sourceTasks = Array.isArray(tasks) ? tasks : [];
  const seen = new Set();
  const normalizedTasks = [];

  for (const task of sourceTasks) {
    const normalized = normalizeSuggestedTaskItem(task);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedTasks.push(normalized);

    if (normalizedTasks.length >= maxTasks) {
      break;
    }
  }

  return normalizedTasks;
}

function extractExistingChecklistItems(body) {
  const text = String(body || '');
  const items = [];
  const pattern = /^\s*[-*+]\s+\[[ xX]\]\s+(.*)$/gm;
  let match = pattern.exec(text);

  while (match) {
    const item = normalizeSuggestedTaskItem(match[1]);
    if (item) {
      items.push(item);
    }
    match = pattern.exec(text);
  }

  return normalizeSuggestedTaskItems(items, { maxTasks: 30 });
}

function parseJsonValue(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return null;
  }

  const fencedJsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    raw,
    fencedJsonMatch ? fencedJsonMatch[1].trim() : '',
  ].filter(Boolean);

  try {
    return JSON.parse(raw);
  } catch {
    // Continue with extracted JSON candidates below.
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const beforeArray = raw.slice(0, firstBracket).trim();
    const arrayCandidate = raw.slice(firstBracket, lastBracket + 1).trim();
    if (raw.trim().startsWith('[') || /^[a-z0-9 _-]+:\s*$/i.test(beforeArray)) {
      candidates.push(arrayCandidate);
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function splitSuggestedTaskText(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!text) {
    return [];
  }

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^```/.test(line))
    .filter((line) => !/^[{[\]},]*$/.test(line))
    .filter((line) => !/^(tasks?|checklist|items?|todos?|suggestions)\s*[:=-]?\s*$/i.test(line))
    .filter((line) => !/^["']?(tasks?|checklist|items?|todos?|suggestions)["']?\s*:/i.test(line))
    .filter((line) => !/^(here are|sure\b|certainly\b)/i.test(line))
    .map((line) => line.replace(/,$/, '').replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

function extractTasksFromParsedValue(parsedValue) {
  if (Array.isArray(parsedValue)) {
    return parsedValue;
  }

  if (typeof parsedValue === 'string') {
    return splitSuggestedTaskText(parsedValue);
  }

  if (!isObject(parsedValue)) {
    return [];
  }

  for (const key of TASK_COLLECTION_KEYS) {
    const value = parsedValue[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
    if (typeof value === 'string') {
      const nestedJsonTasks = normalizeSuggestedTaskItems(extractTasksFromParsedValue(parseJsonValue(value)), { maxTasks: 30 });
      if (nestedJsonTasks.length > 0) {
        return nestedJsonTasks;
      }

      const splitTasks = splitSuggestedTaskText(value);
      if (splitTasks.length > 0) {
        return splitTasks;
      }
    }
  }

  for (const key of ['result', 'data', 'response', 'output']) {
    const tasks = extractTasksFromParsedValue(parsedValue[key]);
    if (tasks.length > 0) {
      return tasks;
    }
  }

  for (const value of Object.values(parsedValue)) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  return [];
}

function extractSuggestedTasksFromContent(content, options = {}) {
  const parsedValue = parseJsonValue(content);
  const parsedTasks = normalizeSuggestedTaskItems(extractTasksFromParsedValue(parsedValue), options);
  if (parsedTasks.length > 0 || parsedValue !== null) {
    return parsedTasks;
  }

  return normalizeSuggestedTaskItems(splitSuggestedTaskText(content), options);
}

function normalizeSuggestedTitle(value) {
  const title = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) {
    return '';
  }

  return title.length > MAX_TITLE_LENGTH
    ? `${title.slice(0, MAX_TITLE_LENGTH - 3).trim()}...`
    : title;
}

function extractSuggestedTitleFromContent(content) {
  const parsedValue = parseJsonValue(content);
  if (isObject(parsedValue)) {
    for (const key of ['title', 'newTitle', 'new_title', 'suggestedTitle', 'suggested_title']) {
      const title = normalizeSuggestedTitle(parsedValue[key]);
      if (title) {
        return title;
      }
    }
  }

  if (typeof parsedValue === 'string') {
    const title = normalizeSuggestedTitle(parsedValue);
    if (title) {
      return title;
    }
  }

  if (parsedValue !== null) {
    return '';
  }

  return normalizeSuggestedTitle(String(content || '').split('\n')[0]);
}

function normalizeSuggestedMarkdownBody(value) {
  const body = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return body;
}

function extractSuggestedMarkdownBodyFromContent(content) {
  const parsedValue = parseJsonValue(content);
  if (isObject(parsedValue)) {
    for (const key of ['body', 'markdown', 'content', 'text', 'notes']) {
      const body = normalizeSuggestedMarkdownBody(parsedValue[key]);
      if (body) {
        return body;
      }
    }
  }

  if (typeof parsedValue === 'string') {
    const body = normalizeSuggestedMarkdownBody(parsedValue);
    if (body) {
      return body;
    }
  }

  if (parsedValue !== null) {
    return '';
  }

  return normalizeSuggestedMarkdownBody(content);
}

function normalizeSuggestedLabelReference(value) {
  const normalized = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length > 120 ? '' : normalized;
}

function collectSuggestedLabelReferences(value, output, seen, options = {}) {
  const maxLabels = Number.isInteger(options.maxLabels) ? options.maxLabels : 20;
  if (output.length >= maxLabels || value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = normalizeSuggestedLabelReference(value);
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      output.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSuggestedLabelReferences(item, output, seen, options);
      if (output.length >= maxLabels) {
        return;
      }
    }
    return;
  }

  if (isObject(value)) {
    for (const key of LABEL_TEXT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectSuggestedLabelReferences(value[key], output, seen, options);
        return;
      }
    }
  }
}

function extractSuggestedLabelReferencesFromContent(content, options = {}) {
  const parsedValue = parseJsonValue(content);
  const output = [];
  const seen = new Set();
  const maxLabels = Number.isInteger(options.maxLabels) ? options.maxLabels : 20;

  if (Array.isArray(parsedValue)) {
    collectSuggestedLabelReferences(parsedValue, output, seen, { maxLabels });
    return output;
  }

  if (isObject(parsedValue)) {
    for (const key of LABEL_COLLECTION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(parsedValue, key)) {
        collectSuggestedLabelReferences(parsedValue[key], output, seen, { maxLabels });
        return output;
      }
    }
    collectSuggestedLabelReferences(parsedValue, output, seen, { maxLabels });
    return output;
  }

  if (typeof parsedValue === 'string') {
    collectSuggestedLabelReferences(parsedValue, output, seen, { maxLabels });
    return output;
  }

  if (parsedValue !== null) {
    return [];
  }

  const lines = String(content || '')
    .replace(/\r\n?/g, '\n')
    .split(/[\n,]/)
    .map(normalizeSuggestedLabelReference)
    .filter(Boolean);
  collectSuggestedLabelReferences(lines, output, seen, { maxLabels });
  return output;
}

function normalizeSmartCardAction(actionDefinition = {}) {
  const source = isObject(actionDefinition) ? actionDefinition : {};
  const id = String(source.id || '').trim();
  const inferredType = id === 'generate-title'
    ? 'title'
    : (id === 'generate-summary'
      ? 'summary'
      : (id === 'generate-task-list'
        ? 'tasks'
        : (id === 'auto-label-card' ? 'labels' : (id === 'smart-paste' ? 'paste' : 'custom'))));
  const type = SMART_CARD_ACTION_TYPES.has(source.type) ? source.type : inferredType;
  const label = String(source.label || '').replace(/\s+/g, ' ').trim() || 'Smart Card Action';
  const prompt = String(source.prompt || '').replace(/\r\n?/g, '\n').trim();

  return {
    id: id || type,
    type,
    label,
    prompt,
    builtIn: source.builtIn === true,
  };
}

function getSmartCardActionNumPredict(action) {
  if (action.type === 'title') {
    return DEFAULT_TITLE_NUM_PREDICT;
  }

  if (action.type === 'tasks') {
    return DEFAULT_TASK_NUM_PREDICT;
  }

  if (action.type === 'labels') {
    return DEFAULT_LABEL_NUM_PREDICT;
  }

  return DEFAULT_SMART_BODY_NUM_PREDICT;
}

function getSmartCardActionOutputInstruction(action) {
  if (action.type === 'title') {
    return 'Return JSON only in this shape: {"title":"Improved card title"}.';
  }

  if (action.type === 'tasks') {
    return 'Return JSON only in this shape: {"tasks":["Task one","Task two"]}. Follow the action prompt for how many tasks to create.';
  }

  if (action.type === 'summary') {
    return 'Return JSON only in this shape: {"body":"Generated summary Markdown"}. Use only the generated summary text inside the body value; do not include the generated-summary end marker.';
  }

  if (action.type === 'labels') {
    return 'Return JSON only in this shape: {"labels":["Exact existing label name"]}. Choose only from availableLabels in the card context. Do not return labels already listed in labels. Return {"labels":[]} when no existing label clearly fits.';
  }

  return 'Return JSON only in this shape: {"body":"Markdown text to add to the card"}. Use Markdown text only inside the body value.';
}

function buildSmartCardActionMessages(actionDefinition = {}, cardContext = {}, options = {}) {
  const action = normalizeSmartCardAction(actionDefinition);
  const existingTasks = Array.isArray(cardContext.existingTasks)
    ? normalizeSuggestedTaskItems(cardContext.existingTasks, { maxTasks: 30 })
    : extractExistingChecklistItems(cardContext.body);
  const pastedText = compactText(options.pasteText || cardContext.pasteText, MAX_PASTE_CONTEXT_LENGTH);

  const context = {
    action: {
      id: action.id,
      type: action.type,
      label: action.label,
    },
    board: compactText(cardContext.boardName, 120),
    list: compactText(cardContext.listName, 120),
    title: compactText(cardContext.title, 240),
    labels: Array.isArray(cardContext.labels)
      ? cardContext.labels.map((label) => compactText(label, 80)).filter(Boolean).slice(0, 12)
      : [],
    availableLabels: Array.isArray(cardContext.availableLabels)
      ? cardContext.availableLabels
        .map((label) => {
          if (isObject(label)) {
            return {
              id: compactText(label.id, 80),
              name: compactText(label.name, 80),
            };
          }
          return {
            id: '',
            name: compactText(label, 80),
          };
        })
        .filter((label) => label.id || label.name)
        .slice(0, 50)
      : [],
    start: compactText(cardContext.start, 32),
    due: compactText(cardContext.due, 32),
    existingTasks,
    body: compactText(cardContext.body, MAX_BODY_CONTEXT_LENGTH),
    pastedText,
    currentDate: compactText(options.currentDate, 32),
  };

  return [
    {
      role: 'system',
      content: [
        'You run Smart Card Actions for Signboard Markdown cards.',
        'Follow the action prompt and use the card context.',
        'Do not duplicate existing checklist items.',
        'Do not invent facts.',
        'Do not include code fences around the JSON response.',
        getSmartCardActionOutputInstruction(action),
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Action label: ${action.label}`,
        'Action prompt:',
        action.prompt,
        'Card context:',
        JSON.stringify(context),
      ].join('\n\n'),
    },
  ];
}

function buildCardTaskSuggestionMessages(cardContext = {}, options = {}) {
  const taskCount = normalizeTaskCount(options.taskCount, DEFAULT_TASK_COUNT);
  const existingTasks = Array.isArray(cardContext.existingTasks)
    ? normalizeSuggestedTaskItems(cardContext.existingTasks, { maxTasks: 30 })
    : extractExistingChecklistItems(cardContext.body);

  const context = {
    board: compactText(cardContext.boardName, 120),
    list: compactText(cardContext.listName, 120),
    title: compactText(cardContext.title, 240),
    labels: Array.isArray(cardContext.labels)
      ? cardContext.labels.map((label) => compactText(label, 80)).filter(Boolean).slice(0, 12)
      : [],
    existingTasks,
    body: compactText(cardContext.body, MAX_BODY_CONTEXT_LENGTH),
    requestedTaskCount: taskCount,
    currentDate: compactText(options.currentDate, 32),
  };

  return [
    {
      role: 'system',
      content: [
        'You suggest practical checklist items for a Signboard Markdown card.',
        'Infer common next actions from the card title, body, board, list, and labels.',
        `Return ${taskCount} concrete tasks whenever possible, and never return an empty tasks array.`,
        'If the card has sparse context, infer common tasks from the title and list name.',
        'Do not duplicate existing checklist items.',
        'Use short imperative task text.',
        'Do not include Markdown checkbox prefixes.',
        'Return JSON only in this shape: {"tasks":["Task one","Task two"]}.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Suggest ${taskCount} useful checklist tasks for this card.`,
        'Return only a JSON object with a non-empty "tasks" array.',
        JSON.stringify(context),
      ].join('\n\n'),
    },
  ];
}

async function parseErrorBody(response) {
  try {
    const body = await response.text();
    if (!body) {
      return '';
    }

    try {
      const parsed = JSON.parse(body);
      return typeof parsed.error === 'string' ? parsed.error : body;
    } catch {
      return body.slice(0, 300);
    }
  } catch {
    return '';
  }
}

function createAiError(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  if (isObject(details)) {
    error.details = details;
  }
  return error;
}

function normalizeOllamaModelEntry(entry) {
  if (!isObject(entry)) {
    return null;
  }

  const name = String(entry.name || entry.model || '').trim();
  if (!name) {
    return null;
  }

  return {
    name,
    model: String(entry.model || name).trim() || name,
    modifiedAt: typeof entry.modified_at === 'string' ? entry.modified_at : '',
    size: Number.isFinite(entry.size) ? entry.size : 0,
    digest: typeof entry.digest === 'string' ? entry.digest : '',
    details: isObject(entry.details) ? { ...entry.details } : {},
  };
}

function normalizeOllamaModelList(models) {
  const sourceModels = Array.isArray(models) ? models : [];
  const seen = new Set();
  const normalizedModels = [];

  for (const model of sourceModels) {
    const normalized = normalizeOllamaModelEntry(model);
    if (!normalized || seen.has(normalized.name)) {
      continue;
    }

    seen.add(normalized.name);
    normalizedModels.push(normalized);
  }

  return normalizedModels.sort((left, right) => left.name.localeCompare(right.name));
}

async function listOllamaModels(ollamaSettings = {}, options = {}) {
  const sourceSettings = isObject(ollamaSettings) ? ollamaSettings : {};
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw createAiError('This runtime cannot inspect Ollama.', 'AI_FETCH_UNAVAILABLE');
  }

  const endpoint = buildOllamaTagsUrl(sourceSettings.url);
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : DEFAULT_OLLAMA_INSPECT_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw createAiError('Ollama did not respond before the request timed out.', 'AI_REQUEST_TIMEOUT');
    }

    throw createAiError(`Unable to reach Ollama at ${endpoint}.`, 'AI_CONNECTION_FAILED');
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response || !response.ok) {
    const status = response && response.status ? response.status : 'unknown';
    const errorBody = response ? await parseErrorBody(response) : '';
    throw createAiError(
      errorBody ? `Ollama model list failed (${status}): ${errorBody}` : `Ollama model list failed (${status}).`,
      'AI_PROVIDER_ERROR',
    );
  }

  const data = await response.json();
  return {
    url: normalizeOllamaBaseUrl(sourceSettings.url),
    models: normalizeOllamaModelList(data && data.models),
  };
}

async function suggestCardTasksWithOllama(ollamaSettings = {}, cardContext = {}, options = {}) {
  const sourceSettings = isObject(ollamaSettings) ? ollamaSettings : {};
  const model = String(sourceSettings.model || '').trim();
  if (!model) {
    throw createAiError('Choose an Ollama model in App Settings.', 'AI_MODEL_MISSING');
  }

  const taskCount = normalizeTaskCount(sourceSettings.taskCount, DEFAULT_TASK_COUNT);
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw createAiError('This runtime cannot make AI requests.', 'AI_FETCH_UNAVAILABLE');
  }

  const endpoint = buildOllamaChatUrl(sourceSettings.url);
  const requestBody = {
    model,
    stream: false,
    think: false,
    format: 'json',
    options: {
      temperature: 0.2,
      num_predict: DEFAULT_TASK_NUM_PREDICT,
    },
    messages: buildCardTaskSuggestionMessages(cardContext, {
      taskCount,
      currentDate: options.currentDate,
    }),
  };

  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : DEFAULT_OLLAMA_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw createAiError('Ollama did not respond before the request timed out.', 'AI_REQUEST_TIMEOUT');
    }

    throw createAiError(`Unable to reach Ollama at ${endpoint}.`, 'AI_CONNECTION_FAILED');
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response || !response.ok) {
    const status = response && response.status ? response.status : 'unknown';
    const errorBody = response ? await parseErrorBody(response) : '';
    throw createAiError(
      errorBody ? `Ollama request failed (${status}): ${errorBody}` : `Ollama request failed (${status}).`,
      'AI_PROVIDER_ERROR',
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw createAiError('Ollama returned a response that was not valid JSON.', 'AI_PROVIDER_ERROR', {
      provider: 'ollama',
      endpoint,
      model,
      parseError: error && error.message ? String(error.message) : String(error || ''),
    });
  }

  const responseMessage = data && isObject(data.message) ? data.message : {};
  const content = typeof responseMessage.content === 'string'
    ? responseMessage.content
    : (typeof data.response === 'string' ? data.response : '');
  const tasks = extractSuggestedTasksFromContent(content, { maxTasks: taskCount });

  if (tasks.length === 0) {
    const hasThinking = typeof responseMessage.thinking === 'string' && responseMessage.thinking.trim().length > 0;
    const doneReason = typeof data.done_reason === 'string' ? data.done_reason : '';
    const debugDetails = {
      provider: 'ollama',
      endpoint,
      model,
      request: {
        think: requestBody.think,
        numPredict: requestBody.options.num_predict,
        format: requestBody.format,
      },
      responseContent: content,
      doneReason,
      responseHasThinking: hasThinking,
      thinkingLength: hasThinking ? responseMessage.thinking.length : 0,
      response: data,
    };
    const usedBudgetThinking = !content.trim() && hasThinking && doneReason === 'length';

    throw createAiError(
      usedBudgetThinking
        ? 'The model spent its response budget thinking and did not return tasks.'
        : 'The model did not return any usable tasks.',
      usedBudgetThinking ? 'AI_THINKING_RESPONSE_TRUNCATED' : 'AI_EMPTY_SUGGESTIONS',
      debugDetails,
    );
  }

  return {
    tasks,
    model,
    provider: 'ollama',
  };
}

async function runSmartCardActionWithOllama(ollamaSettings = {}, actionDefinition = {}, cardContext = {}, options = {}) {
  const sourceSettings = isObject(ollamaSettings) ? ollamaSettings : {};
  const model = String(sourceSettings.model || '').trim();
  if (!model) {
    throw createAiError('Choose an Ollama model in App Settings.', 'AI_MODEL_MISSING');
  }

  const action = normalizeSmartCardAction(actionDefinition);
  if (!action.prompt) {
    throw createAiError('Smart Card Action prompt is empty.', 'AI_ACTION_PROMPT_MISSING');
  }

  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw createAiError('This runtime cannot make AI requests.', 'AI_FETCH_UNAVAILABLE');
  }

  const endpoint = buildOllamaChatUrl(sourceSettings.url);
  const requestBody = {
    model,
    stream: false,
    think: false,
    format: 'json',
    options: {
      temperature: action.type === 'title' ? 0.15 : 0.2,
      num_predict: getSmartCardActionNumPredict(action),
    },
    messages: buildSmartCardActionMessages(action, cardContext, {
      currentDate: options.currentDate,
      pasteText: options.pasteText,
    }),
  };

  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : DEFAULT_OLLAMA_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw createAiError('Ollama did not respond before the request timed out.', 'AI_REQUEST_TIMEOUT');
    }

    throw createAiError(`Unable to reach Ollama at ${endpoint}.`, 'AI_CONNECTION_FAILED');
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response || !response.ok) {
    const status = response && response.status ? response.status : 'unknown';
    const errorBody = response ? await parseErrorBody(response) : '';
    throw createAiError(
      errorBody ? `Ollama request failed (${status}): ${errorBody}` : `Ollama request failed (${status}).`,
      'AI_PROVIDER_ERROR',
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw createAiError('Ollama returned a response that was not valid JSON.', 'AI_PROVIDER_ERROR', {
      provider: 'ollama',
      endpoint,
      model,
      action,
      parseError: error && error.message ? String(error.message) : String(error || ''),
    });
  }

  const responseMessage = data && isObject(data.message) ? data.message : {};
  const content = typeof responseMessage.content === 'string'
    ? responseMessage.content
    : (typeof data.response === 'string' ? data.response : '');
  const result = {
    actionId: action.id,
    actionType: action.type,
    label: action.label,
    model,
    provider: 'ollama',
  };

  if (action.type === 'title') {
    result.title = extractSuggestedTitleFromContent(content);
  } else if (action.type === 'tasks') {
    result.tasks = extractSuggestedTasksFromContent(content, { maxTasks: DEFAULT_SMART_ACTION_TASK_RESULT_LIMIT });
  } else if (action.type === 'labels') {
    result.labels = extractSuggestedLabelReferencesFromContent(content, { maxLabels: 20 });
  } else {
    result.body = extractSuggestedMarkdownBodyFromContent(content);
  }

  const hasOutput = Boolean(
    result.title ||
    (Array.isArray(result.tasks) && result.tasks.length > 0) ||
    action.type === 'labels' ||
    (Array.isArray(result.labels) && result.labels.length > 0) ||
    result.body,
  );

  if (!hasOutput) {
    const hasThinking = typeof responseMessage.thinking === 'string' && responseMessage.thinking.trim().length > 0;
    const doneReason = typeof data.done_reason === 'string' ? data.done_reason : '';
    const debugDetails = {
      provider: 'ollama',
      endpoint,
      model,
      action,
      request: {
        think: requestBody.think,
        numPredict: requestBody.options.num_predict,
        format: requestBody.format,
      },
      responseContent: content,
      doneReason,
      responseHasThinking: hasThinking,
      thinkingLength: hasThinking ? responseMessage.thinking.length : 0,
      response: data,
    };
    const usedBudgetThinking = !content.trim() && hasThinking && doneReason === 'length';

    throw createAiError(
      usedBudgetThinking
        ? 'The model spent its response budget thinking and did not return a Smart Card Action result.'
        : 'The model did not return a usable Smart Card Action result.',
      usedBudgetThinking ? 'AI_THINKING_RESPONSE_TRUNCATED' : 'AI_EMPTY_ACTION_RESULT',
      debugDetails,
    );
  }

  return result;
}

module.exports = {
  DEFAULT_OLLAMA_INSPECT_TIMEOUT_MS,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  DEFAULT_LABEL_NUM_PREDICT,
  DEFAULT_TASK_COUNT,
  DEFAULT_TASK_NUM_PREDICT,
  DEFAULT_SMART_BODY_NUM_PREDICT,
  DEFAULT_TITLE_NUM_PREDICT,
  buildCardTaskSuggestionMessages,
  buildSmartCardActionMessages,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
  extractExistingChecklistItems,
  extractSuggestedMarkdownBodyFromContent,
  extractSuggestedLabelReferencesFromContent,
  extractSuggestedTasksFromContent,
  extractSuggestedTitleFromContent,
  listOllamaModels,
  normalizeSmartCardAction,
  normalizeOllamaBaseUrl,
  normalizeOllamaModelList,
  normalizeSuggestedTaskItem,
  normalizeSuggestedTaskItems,
  normalizeTaskCount,
  runSmartCardActionWithOllama,
  suggestCardTasksWithOllama,
};
