let activeTabId = null;
let isCapturing = false;

// Listen for messages from popup and offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG] Received message:', message.type, 'from:', sender.url || 'unknown');

  if (message.type === 'START_CAPTURE') {
    startCapture(sendResponse);
    return true; // async response
  }

  if (message.type === 'STOP_CAPTURE') {
    stopCapture();
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'AUDIO_CHUNK') {
    handleAudioChunk(message.audioData);
    return false;
  }

  if (message.type === 'OFFSCREEN_READY') {
    console.log('[BG] Offscreen document is ready');
    return false;
  }

  if (message.type === 'OFFSCREEN_ERROR') {
    console.error('[BG] Offscreen error:', message.error);
    // Forward error to the active tab as a status message
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'SHOW_STATUS',
        text: 'Audio error: ' + message.error
      }).catch(() => {});
    }
    return false;
  }
});

async function startCapture(sendResponse) {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }
    activeTabId = tab.id;
    console.log('[BG] Active tab:', tab.id, tab.url);

    // Create offscreen document FIRST so it's ready to receive
    await ensureOffscreenDocument();

    // Small delay to ensure offscreen document's listener is registered
    await new Promise(r => setTimeout(r, 500));

    // Get a media stream ID for tab capture
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });
    console.log('[BG] Got stream ID:', streamId ? streamId.substring(0, 20) + '...' : 'null');

    // Send the stream ID to the offscreen document to start recording
    chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      streamId: streamId
    });

    isCapturing = true;
    sendResponse({ success: true });

    // Ensure content script is injected, then notify
    await ensureContentScript(activeTabId);
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_STATUS',
      text: 'Listening for Japanese audio...'
    }).catch(() => {});

  } catch (err) {
    console.error('[BG] Failed to start capture:', err);
    sendResponse({ success: false, error: err.message });
  }
}

function stopCapture() {
  isCapturing = false;
  chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  chrome.storage.local.set({ isCapturing: false });
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: 'HIDE_SUBTITLE' }).catch(() => {});
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    // Content script not loaded — inject it
    console.log('[BG] Injecting content script into tab', tabId);
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

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    console.log('[BG] Offscreen document already exists');
    return;
  }

  console.log('[BG] Creating offscreen document...');
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Recording tab audio for Japanese speech recognition'
  });
  console.log('[BG] Offscreen document created');
}

async function handleAudioChunk(audioBase64) {
  if (!isCapturing || !activeTabId) {
    console.log('[BG] Skipping chunk - not capturing or no active tab');
    return;
  }

  console.log('[BG] Processing audio chunk, size:', audioBase64.length);

  try {
    const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);
    if (!apiKey) {
      console.error('[BG] No API key found');
      return;
    }

    // Convert base64 to blob for Whisper API
    const audioBytes = atob(audioBase64);
    const audioArray = new Uint8Array(audioBytes.length);
    for (let i = 0; i < audioBytes.length; i++) {
      audioArray[i] = audioBytes.charCodeAt(i);
    }
    const audioBlob = new Blob([audioArray], { type: 'audio/webm' });
    console.log('[BG] Audio blob size:', audioBlob.size, 'bytes');

    // Show processing status
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_STATUS',
      text: 'Processing audio...'
    }).catch(() => {});

    // Step 1: Transcribe Japanese audio with Whisper
    const transcription = await transcribeAudio(apiKey, audioBlob);
    console.log('[BG] Transcription:', transcription);

    if (!transcription || transcription.trim() === '') {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'SHOW_STATUS',
        text: 'Listening... (no speech detected)'
      }).catch(() => {});
      return;
    }

    // Step 2: Translate Japanese to English with GPT
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_STATUS',
      text: 'Translating...'
    }).catch(() => {});

    const translation = await translateText(apiKey, transcription, model || 'gpt-4o-mini');
    console.log('[BG] Translation:', translation);

    if (!translation) return;

    // Step 3: Send subtitle to content script
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_SUBTITLE',
      original: transcription,
      translation: translation
    }).catch((err) => {
      console.error('[BG] Failed to send subtitle to tab:', err);
    });

  } catch (err) {
    console.error('[BG] Processing error:', err);
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_STATUS',
      text: 'Error: ' + err.message
    }).catch(() => {});
  }
}

async function transcribeAudio(apiKey, audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'ja');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[BG] Whisper API error:', response.status, errText);
    throw new Error('Whisper API: ' + response.status);
  }

  const data = await response.json();
  return data.text;
}

async function translateText(apiKey, japaneseText, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Translate the following Japanese text to natural English. Return only the translation, nothing else.'
        },
        {
          role: 'user',
          content: japaneseText
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[BG] GPT API error:', response.status, errText);
    throw new Error('GPT API: ' + response.status);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || null;
}
