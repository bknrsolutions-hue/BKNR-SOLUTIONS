const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ACTION_PATTERN = /\b(save|add|create|update|delete|remove|cancel|approve|reject|post|submit|upload|import|generate|register|record|lock|unlock|rollback|process|pay|match|execute|run)\b/i;
const PASSIVE_LABELS = new Set(['cancel', 'close', 'reset', 'clear', 'back', 'dismiss']);
const AUTH_EXCLUSIONS = [
  '/auth/login',
  '/auth/session-info',
  '/auth/global-dropdowns',
];

const installations = new WeakMap();

function cleanLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[✓✔✕×]/g, '')
    .trim();
}

function getActionLabel(element) {
  return cleanLabel(
    element?.dataset?.confirmLabel
      || element?.getAttribute?.('aria-label')
      || element?.getAttribute?.('title')
      || element?.textContent
      || 'this action',
  );
}

function requiresConfirmation(element) {
  if (!element || element.disabled || element.dataset.confirmSkip === 'true') return false;
  if (element.dataset.confirm) return true;

  const label = getActionLabel(element).toLowerCase();
  if (!label || PASSIVE_LABELS.has(label)) return false;
  return ACTION_PATTERN.test(label);
}

function confirmationMessage(element) {
  const customMessage = cleanLabel(element?.dataset?.confirm);
  if (customMessage && customMessage !== 'true') return customMessage;
  return `Are you sure you want to proceed with "${getActionLabel(element)}"?`;
}

function responseMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  return payload.message || payload.detail || payload.error || fallback;
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  return input?.url || '';
}

function isExcludedMutation(url) {
  return AUTH_EXCLUSIONS.some(path => String(url).includes(path));
}

export function installActionFeedback(targetWindow = window, feedbackWindow = window) {
  if (!targetWindow?.document || installations.has(targetWindow)) {
    return installations.get(targetWindow) || (() => {});
  }

  const targetDocument = targetWindow.document;
  const nativeConfirm = targetWindow.confirm.bind(targetWindow);
  const nativeFetch = targetWindow.fetch.bind(targetWindow);
  let lastConfirmedAt = 0;
  let lastConfirmedElement = null;

  const dispatchFeedback = detail => {
    feedbackWindow.dispatchEvent(new feedbackWindow.CustomEvent('bknr:api-feedback', { detail }));
  };

  const confirmElementAction = element => {
    if (!requiresConfirmation(element)) return true;
    const accepted = nativeConfirm(confirmationMessage(element));
    if (accepted) {
      lastConfirmedAt = Date.now();
      lastConfirmedElement = element;
    }
    return accepted;
  };

  const handleClick = event => {
    const action = event.target?.closest?.('button, [role="button"], input[type="submit"], input[type="button"]');
    if (!action || !requiresConfirmation(action)) return;
    if (confirmElementAction(action)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handleSubmit = event => {
    const submitter = event.submitter;
    const form = event.target;
    const action = submitter || form;
    if (!action || !requiresConfirmation(action)) return;
    if (lastConfirmedElement === submitter && Date.now() - lastConfirmedAt < 5000) return;
    if (confirmElementAction(action)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const appConfirm = message => {
    if (Date.now() - lastConfirmedAt < 5000) {
      lastConfirmedAt = 0;
      lastConfirmedElement = null;
      return true;
    }
    const accepted = nativeConfirm(message);
    if (accepted) lastConfirmedAt = Date.now();
    return accepted;
  };

  const appFetch = async (input, init = {}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const url = requestUrl(input);
    try {
      const response = await nativeFetch(input, init);
      if (MUTATION_METHODS.has(method) && !isExcludedMutation(url)) {
        let payload = null;
        try {
          payload = await response.clone().json();
        } catch {
          // Some successful endpoints intentionally return an empty response.
        }
        dispatchFeedback({
          type: response.ok ? 'success' : 'error',
          message: responseMessage(
            payload,
            response.ok ? 'Action completed successfully.' : `Action failed (${response.status}).`,
          ),
        });
      }
      return response;
    } catch (error) {
      if (MUTATION_METHODS.has(method) && !isExcludedMutation(url)) {
        dispatchFeedback({
          type: 'error',
          message: error?.message || 'Unable to complete the action. Please try again.',
        });
      }
      throw error;
    }
  };

  targetDocument.addEventListener('click', handleClick, true);
  targetDocument.addEventListener('submit', handleSubmit, true);
  targetWindow.confirm = appConfirm;
  targetWindow.fetch = appFetch;

  const cleanup = () => {
    targetDocument.removeEventListener('click', handleClick, true);
    targetDocument.removeEventListener('submit', handleSubmit, true);
    if (targetWindow.confirm === appConfirm) targetWindow.confirm = nativeConfirm;
    if (targetWindow.fetch === appFetch) targetWindow.fetch = nativeFetch;
    installations.delete(targetWindow);
  };
  installations.set(targetWindow, cleanup);
  return cleanup;
}
