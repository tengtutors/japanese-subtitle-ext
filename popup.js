const apiKeyInput = document.getElementById('apiKey');
const fontSizeInput = document.getElementById('fontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
const modelSelect = document.getElementById('model');
const toggleBtn = document.getElementById('toggleBtn');
const testBtn = document.getElementById('testBtn');
const statusEl = document.getElementById('status');

let isRunning = false;

// Ensure content script is injected into the active tab
async function ensureContentScript(tabId) {
  try {
    // Try to ping the content script
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    // Content script not loaded — inject it
    console.log('Injecting content script into tab', tabId);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['styles.css']
    });
  }
}

// Load saved settings
chrome.storage.local.get(['apiKey', 'fontSize', 'model', 'isCapturing'], (data) => {
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  if (data.fontSize) {
    fontSizeInput.value = data.fontSize;
    fontSizeValue.textContent = data.fontSize;
  }
  if (data.model) modelSelect.value = data.model;
  if (data.isCapturing) {
    isRunning = true;
    toggleBtn.textContent = 'Stop';
    toggleBtn.classList.add('active');
    statusEl.textContent = 'Capturing audio...';
  }
});

// Save settings on change
apiKeyInput.addEventListener('change', () => {
  chrome.storage.local.set({ apiKey: apiKeyInput.value });
});

fontSizeInput.addEventListener('input', () => {
  fontSizeValue.textContent = fontSizeInput.value;
  chrome.storage.local.set({ fontSize: parseInt(fontSizeInput.value) });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'UPDATE_FONT_SIZE',
        fontSize: parseInt(fontSizeInput.value)
      }).catch(() => {});
    }
  });
});

modelSelect.addEventListener('change', () => {
  chrome.storage.local.set({ model: modelSelect.value });
});

// Test button - sends a sample subtitle to verify display works
testBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    statusEl.textContent = 'No active tab found.';
    return;
  }

  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_SUBTITLE',
      original: 'これはテストです。字幕が表示されています。',
      translation: 'This is a test. Subtitles are being displayed.'
    });
    statusEl.textContent = 'Test subtitle sent! Check the page.';
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});

toggleBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey && !isRunning) {
    statusEl.textContent = 'Please enter your OpenAI API key.';
    return;
  }

  if (!isRunning) {
    statusEl.textContent = 'Starting capture...';

    // Ensure content script is ready on the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await ensureContentScript(tab.id);
      } catch (err) {
        console.warn('Could not inject content script:', err);
      }
    }

    chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
        return;
      }
      if (response && response.success) {
        isRunning = true;
        toggleBtn.textContent = 'Stop';
        toggleBtn.classList.add('active');
        statusEl.textContent = 'Capturing audio from tab...';
        chrome.storage.local.set({ isCapturing: true });
      } else {
        statusEl.textContent = 'Error: ' + (response?.error || 'Failed to start');
      }
    });
  } else {
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, () => {
      isRunning = false;
      toggleBtn.textContent = 'Start';
      toggleBtn.classList.remove('active');
      statusEl.textContent = 'Stopped.';
      chrome.storage.local.set({ isCapturing: false });
    });
  }
});
