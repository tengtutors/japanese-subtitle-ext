# Privacy Policy — Japanese Audio to English Subtitles

**Last updated:** March 2, 2026

## Overview

"Japanese Audio to English Subtitles" is a Chrome extension that captures audio from your browser tab, transcribes Japanese speech, and displays English subtitles. Your privacy is important to us.

## Data Collection

This extension **does not collect, store, or transmit any personal data** to our servers. We do not have servers.

### What data is processed

- **Tab audio**: Audio from your active browser tab is captured temporarily in memory and sent directly to OpenAI's API for transcription and translation. Audio is never stored on disk or sent anywhere other than OpenAI.
- **OpenAI API key**: Your API key is stored locally on your device using Chrome's storage API. It is only used to authenticate requests to OpenAI and is never transmitted to any other party.
- **User preferences**: Subtitle font size, position, and model selection are stored locally on your device.

### What data is NOT collected

- No personal information (name, email, etc.)
- No browsing history or URLs
- No analytics or tracking data
- No cookies
- No data shared with third parties (other than OpenAI for the core transcription/translation functionality that you initiate)

## Third-Party Services

This extension sends audio data to **OpenAI's API** (api.openai.com) solely for the purpose of:
1. Transcribing Japanese speech to text (Whisper API)
2. Translating Japanese text to English (Chat API)

Your use of OpenAI's services is subject to [OpenAI's Privacy Policy](https://openai.com/privacy) and [Terms of Use](https://openai.com/terms).

## Data Storage

All data is stored locally on your device using Chrome's `chrome.storage.local` API. No data is stored on external servers.

## Data Retention

- Audio data is processed in real-time and immediately discarded after transcription.
- Local preferences persist until you uninstall the extension or clear extension data.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted to this page.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/tengtutors/japanese-subtitle-ext/issues
