(function initializeSignboardActionSharing() {
  const FORMAT = 'signboard-smart-action';
  const VERSION = 1;
  const PREFIX = 'signboard-action-v1:';
  const CAPABILITIES = new Set([
    'create-card', 'update-title', 'append-content', 'add-labels', 'set-dates', 'move-card', 'archive-card',
  ]);

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  function cleanText(value, maxLength) {
    return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
  }

  function normalizePackage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.format !== FORMAT || Number(value.version) !== VERSION) return null;
    if (value.scope !== 'card' && value.scope !== 'board') return null;
    const source = value.action;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const name = cleanText(source.name, 80);
    const prompt = cleanText(source.prompt, 8000);
    if (!name || !prompt) return null;
    if (value.scope === 'card') {
      const targets = ['title', 'labels', 'content', 'due', 'attachments'];
      const target = targets.includes(source.target) ? source.target : 'content';
      return { format: FORMAT, version: VERSION, scope: 'card', action: { name, target, prompt } };
    }
    const mode = source.mode === 'changes' ? 'changes' : 'report';
    const capabilities = mode === 'changes' && Array.isArray(source.capabilities)
      ? [...new Set(source.capabilities.map(String).filter((item) => CAPABILITIES.has(item)))].slice(0, 7)
      : [];
    return {
      format: FORMAT,
      version: VERSION,
      scope: 'board',
      action: {
        name,
        description: cleanText(source.description, 240),
        mode,
        capabilities,
        prompt,
      },
    };
  }

  function readPackageFromLocation() {
    const fragment = window.location.hash.replace(/^#/, '');
    if (!fragment.startsWith(PREFIX)) return null;
    const payload = fragment.slice(PREFIX.length);
    if (!payload || payload.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
    try {
      return normalizePackage(JSON.parse(decodeBase64Url(payload)));
    } catch (_error) {
      return null;
    }
  }

  function getFileName(actionPackage) {
    const slug = actionPackage.action.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return `${slug || 'signboard-action'}.signboard-action`;
  }

  function initialize(root) {
    const actionPackage = readPackageFromLocation();
    const title = root.querySelector('[data-signboard-action-title]');
    const description = root.querySelector('[data-signboard-action-description]');
    const metadata = root.querySelector('[data-signboard-action-metadata]');
    const scope = root.querySelector('[data-signboard-action-scope]');
    const behavior = root.querySelector('[data-signboard-action-behavior]');
    const promptWrap = root.querySelector('[data-signboard-action-prompt-wrap]');
    const prompt = root.querySelector('[data-signboard-action-prompt]');
    const download = root.querySelector('[data-signboard-action-download]');
    const share = root.querySelector('[data-signboard-action-share-button]');
    const status = root.querySelector('[data-signboard-action-status]');

    if (!actionPackage) {
      if (window.location.hash) {
        title.textContent = 'This Smart Action link is not valid';
        description.textContent = 'Ask the sender to copy a new share link from Signboard.';
      }
      return;
    }

    title.textContent = actionPackage.action.name;
    description.textContent = actionPackage.action.description || 'A shared Smart Action for Signboard.';
    scope.textContent = actionPackage.scope === 'board' ? 'Board Action' : 'Card Action';
    behavior.textContent = actionPackage.scope === 'board'
      ? (actionPackage.action.mode === 'changes'
        ? `Proposes changes: ${actionPackage.action.capabilities.join(', ') || 'none'}`
        : 'Read-only report')
      : `Affects ${actionPackage.action.target}`;
    prompt.textContent = actionPackage.action.prompt;
    metadata.hidden = false;
    promptWrap.hidden = false;
    download.hidden = false;
    share.hidden = false;

    download.addEventListener('click', () => {
      const blob = new Blob([`${JSON.stringify(actionPackage, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getFileName(actionPackage);
      anchor.click();
      URL.revokeObjectURL(url);
      status.textContent = 'Downloaded. Import this file from Signboard’s Smart Actions settings.';
    });

    share.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: actionPackage.action.name, text: 'A Signboard Smart Action', url: window.location.href });
          status.textContent = 'Shared.';
        } else {
          await navigator.clipboard.writeText(window.location.href);
          status.textContent = 'Copied share link.';
        }
      } catch (error) {
        if (error && error.name !== 'AbortError') status.textContent = 'Unable to share this link.';
      }
    });
  }

  document.querySelectorAll('[data-signboard-action-share]').forEach(initialize);
}());
