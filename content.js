let subtitleContainer = null;
let subtitleOriginal = null;
let subtitleTranslation = null;
let statusEl = null;
let fadeTimeout = null;
let statusTimeout = null;

// Drag state
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function createSubtitleOverlay() {
  if (subtitleContainer) return;

  subtitleContainer = document.createElement('div');
  subtitleContainer.id = 'jp-subtitle-container';

  subtitleTranslation = document.createElement('div');
  subtitleTranslation.id = 'jp-subtitle-translation';

  subtitleOriginal = document.createElement('div');
  subtitleOriginal.id = 'jp-subtitle-original';

  statusEl = document.createElement('div');
  statusEl.id = 'jp-subtitle-status';

  // Drag handle indicator
  const dragHandle = document.createElement('div');
  dragHandle.id = 'jp-subtitle-drag-handle';
  dragHandle.textContent = '⠿';

  subtitleContainer.appendChild(dragHandle);
  subtitleContainer.appendChild(subtitleTranslation);
  subtitleContainer.appendChild(subtitleOriginal);
  subtitleContainer.appendChild(statusEl);
  document.body.appendChild(subtitleContainer);

  // Make draggable
  setupDrag(subtitleContainer);

  // Apply saved font size and position
  chrome.storage.local.get(['fontSize', 'subtitlePos'], (data) => {
    const size = data.fontSize || 24;
    subtitleTranslation.style.fontSize = size + 'px';
    subtitleOriginal.style.fontSize = Math.round(size * 0.6) + 'px';

    if (data.subtitlePos) {
      subtitleContainer.style.left = data.subtitlePos.x + 'px';
      subtitleContainer.style.top = data.subtitlePos.y + 'px';
      subtitleContainer.style.bottom = 'auto';
      subtitleContainer.style.transform = 'none';
    }
  });
}

function setupDrag(el) {
  // Allow dragging from anywhere on the subtitle bubble
  el.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = el.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;

    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    el.style.cursor = '';

    // Save position
    const rect = el.getBoundingClientRect();
    chrome.storage.local.set({
      subtitlePos: { x: rect.left, y: rect.top }
    });
  });
}

function showSubtitle(original, translation) {
  createSubtitleOverlay();

  statusEl.style.display = 'none';
  subtitleTranslation.textContent = translation;
  subtitleTranslation.style.display = 'inline-block';
  subtitleOriginal.textContent = original;
  subtitleOriginal.style.display = 'inline-block';
  subtitleContainer.classList.add('visible');

  if (fadeTimeout) clearTimeout(fadeTimeout);
  fadeTimeout = setTimeout(() => {
    subtitleContainer.classList.remove('visible');
  }, 8000);
}

function showStatus(text) {
  createSubtitleOverlay();

  subtitleTranslation.style.display = 'none';
  subtitleOriginal.style.display = 'none';
  statusEl.style.display = 'inline-block';
  statusEl.textContent = text;
  subtitleContainer.classList.add('visible');

  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    subtitleContainer.classList.remove('visible');
  }, 5000);
}

// Listen for messages from background and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return;
  }

  if (message.type === 'SHOW_SUBTITLE') {
    showSubtitle(message.original, message.translation);
  }

  if (message.type === 'SHOW_STATUS') {
    showStatus(message.text);
  }

  if (message.type === 'HIDE_SUBTITLE') {
    if (subtitleContainer) {
      subtitleContainer.classList.remove('visible');
    }
  }

  if (message.type === 'UPDATE_FONT_SIZE') {
    createSubtitleOverlay();
    subtitleTranslation.style.fontSize = message.fontSize + 'px';
    subtitleOriginal.style.fontSize = Math.round(message.fontSize * 0.6) + 'px';
  }
});
