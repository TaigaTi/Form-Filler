import {
  MessageFromBackground,
  MessageToBackground,
  StoredSettings,
} from '../shared/types';

function sendToBackground(msg: MessageToBackground): Promise<MessageFromBackground> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function renderSettings(settings: StoredSettings) {
  const keyStatus = document.getElementById('key-status')!;
  const keyInput = document.getElementById('api-key-input') as HTMLInputElement;

  if (settings.claudeApiKey) {
    keyStatus.textContent = 'Set ✓';
    keyStatus.className = 'key-status set';
    keyInput.placeholder = 'sk-ant-••••••••••••';
  } else {
    keyStatus.textContent = 'Not set';
    keyStatus.className = 'key-status unset';
    keyInput.placeholder = 'sk-ant-...';
  }
}

function renderLastFill(settings: StoredSettings) {
  const box = document.getElementById('status-box')!;
  const text = document.getElementById('status-text')!;

  if (!settings.lastFillResult) {
    text.textContent = 'No fills yet';
    text.className = 'status-text';
    box.className = 'status-box';
    return;
  }

  const { fieldsFilled, aiFieldCount, timestamp } = settings.lastFillResult;
  const ago = Math.round((Date.now() - timestamp) / 1000);
  const timeStr = ago < 60 ? 'just now' : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;
  const aiStr = aiFieldCount > 0 ? ` (${aiFieldCount} via AI)` : '';
  text.textContent = `${fieldsFilled} fields filled${aiStr} — ${timeStr}`;
  text.className = 'status-text ok';
  box.className = 'status-box success';
}

function showView(id: 'view-main' | 'view-settings') {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(id)!.classList.add('active');
}

async function init() {
  const response = await sendToBackground({ type: 'GET_SETTINGS' });
  if (response?.type === 'SETTINGS') {
    renderSettings(response.settings);
    renderLastFill(response.settings);
  }

  // Fill button
  document.getElementById('btn-fill')!.addEventListener('click', async () => {
    const btn = document.getElementById('btn-fill') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Filling…';

    const res = await sendToBackground({ type: 'FILL_REQUEST' });

    if (res?.type === 'FILL_COMPLETE') {
      renderLastFill({ claudeApiKey: '', lastFillResult: res.result });
      const box = document.getElementById('status-box')!;
      box.className = 'status-box success';
    } else if (res?.type === 'FILL_ERROR') {
      const text = document.getElementById('status-text')!;
      text.textContent = res.error;
      text.className = 'status-text err';
      document.getElementById('status-box')!.className = 'status-box error';
    }

    btn.disabled = false;
    btn.textContent = '⚡ Fill All Fields';
  });

  // Open settings
  document.getElementById('open-settings')!.addEventListener('click', () => showView('view-settings'));
  document.getElementById('btn-back')!.addEventListener('click', () => showView('view-main'));

  // Save API key
  document.getElementById('btn-save-key')!.addEventListener('click', async () => {
    const key = (document.getElementById('api-key-input') as HTMLInputElement).value.trim();
    const res = await sendToBackground({ type: 'SAVE_API_KEY', key });
    if (res?.type === 'SETTINGS') renderSettings(res.settings);
    const feedback = document.getElementById('save-feedback')!;
    feedback.style.display = 'block';
    setTimeout(() => (feedback.style.display = 'none'), 2000);
  });

  // Clear AI cache
  document.getElementById('btn-clear-cache')!.addEventListener('click', async () => {
    await sendToBackground({ type: 'CLEAR_AI_CACHE' });
    const btn = document.getElementById('btn-clear-cache')!;
    btn.textContent = '✓ Cache cleared';
    setTimeout(() => (btn.textContent = '🗑 Clear AI Cache'), 2000);
  });
}

init();
