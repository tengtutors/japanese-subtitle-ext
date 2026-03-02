let mediaStream = null;
let audioContext = null;
let isRecording = false;

console.log('[OFFSCREEN] Loaded');

chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });

chrome.runtime.onMessage.addListener((message) => {
  console.log('[OFFSCREEN] Received message:', message.type);

  if (message.type === 'START_RECORDING') {
    startRecording(message.streamId);
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording();
  }
});

async function startRecording(streamId) {
  console.log('[OFFSCREEN] Starting recording...');

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    console.log('[OFFSCREEN] Got media stream, tracks:', mediaStream.getAudioTracks().length);

    // Play audio back so the user can still hear it
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(audioContext.destination);

    isRecording = true;

    // Start the record-stop-send loop
    recordLoop();
  } catch (err) {
    console.error('[OFFSCREEN] Failed to start recording:', err);
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_ERROR',
      error: err.message
    });
  }
}

async function recordLoop() {
  while (isRecording) {
    try {
      const audioBlob = await recordChunk(5000);
      if (!isRecording) break;

      if (audioBlob && audioBlob.size > 0) {
        console.log('[OFFSCREEN] Recorded chunk, size:', audioBlob.size, 'bytes');
        const base64 = await blobToBase64(audioBlob);
        chrome.runtime.sendMessage({
          type: 'AUDIO_CHUNK',
          audioData: base64
        });
      }
    } catch (err) {
      console.error('[OFFSCREEN] Record loop error:', err);
      if (!isRecording) break;
    }
  }
}

function recordChunk(durationMs) {
  return new Promise((resolve, reject) => {
    if (!mediaStream || !isRecording) {
      resolve(null);
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(mediaStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    recorder.onerror = (e) => {
      reject(e.error || new Error('MediaRecorder error'));
    };

    recorder.start();

    setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, durationMs);
  });
}

function stopRecording() {
  console.log('[OFFSCREEN] Stopping recording');
  isRecording = false;
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
