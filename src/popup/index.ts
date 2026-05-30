import {
  FillResult,
  MessageFromBackground,
  MessageToBackground,
  StoredSettings,
} from '../shared/types';

function sendToBackground(msg: MessageToBackground): Promise<MessageFromBackground> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function renderSettings(settings: StoredSettings) {
  const enabled = settings.testValidationMode === true;
  (document.getElementById('test-mode-toggle') as HTMLInputElement).checked = enabled;
  document.getElementById('test-mode-badge')!.style.display = enabled ? 'block' : 'none';
}

function renderLastFill(result: FillResult | undefined) {
  const box = document.getElementById('status-box')!;
  const text = document.getElementById('status-text')!;

  if (!result) {
    text.textContent = 'No fills yet';
    text.className = 'status-text';
    box.className = 'status-box';
    return;
  }

  const { fieldsFilled, timestamp } = result;
  const ago = Math.round((Date.now() - timestamp) / 1000);
  const timeStr = ago < 60 ? 'just now' : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;
  text.textContent = `${fieldsFilled} fields filled — ${timeStr}`;
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
    renderLastFill(response.settings.lastFillResult);
  }

  // Fill button
  document.getElementById('btn-fill')!.addEventListener('click', async () => {
    const btn = document.getElementById('btn-fill') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Filling…';

    try {
      const res = await sendToBackground({ type: 'FILL_REQUEST' });

      if (res?.type === 'FILL_COMPLETE') {
        renderLastFill(res.result);
        const box = document.getElementById('status-box')!;
        box.className = 'status-box success';
      } else if (res?.type === 'FILL_ERROR') {
        const text = document.getElementById('status-text')!;
        text.textContent = res.error;
        text.className = 'status-text err';
        document.getElementById('status-box')!.className = 'status-box error';
      }
    } catch (e) {
      const text = document.getElementById('status-text')!;
      text.textContent = String(e);
      text.className = 'status-text err';
      document.getElementById('status-box')!.className = 'status-box error';
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Fill All Fields';
    }
  });

  // Open settings
  document.getElementById('open-settings')!.addEventListener('click', () => showView('view-settings'));
  document.getElementById('btn-back')!.addEventListener('click', () => showView('view-main'));

  // Toggle test validation mode
  document.getElementById('test-mode-toggle')!.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    try {
      const res = await sendToBackground({ type: 'SET_TEST_MODE', enabled });
      if (res?.type === 'SETTINGS') renderSettings(res.settings);
    } catch (err) {
      console.error('[FormFiller] Set test mode error:', err);
    }
  });
}

init();
