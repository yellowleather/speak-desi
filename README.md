# Speak Desi

Voice-to-text for VS Code powered by [Sarvam AI](https://www.sarvam.ai/) `saaras:v3`. Press a key, speak, and your words appear at the cursor — in any editor, terminal, or chat panel.

Works great for Indian languages (Hindi, Kannada, Tamil, Telugu, etc.) as well as English.

---

## How It Works

```
Microphone → SoX → WAV file → Sarvam API (saaras:v3) → text at cursor
```

A small local FastAPI service handles the API call so the VS Code extension stays dependency-free. The service is the only thing that needs your Sarvam API key.

---

## Prerequisites

### 1. Sarvam API Key

Get a free key at [dashboard.sarvam.ai](https://dashboard.sarvam.ai).

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
# edit .env → SARVAM_API_KEY=sk_...
```

### 2. SoX (audio recorder)

The extension uses SoX to capture audio from your microphone.

**macOS:**
```bash
brew install sox
```

**Ubuntu/Debian:**
```bash
sudo apt-get install sox libsox-fmt-all
```

**Windows:** Download from [SoX SourceForge](https://sourceforge.net/projects/sox/files/sox/)

---

## Setup

### Step 1 — Start the Sarvam service

**Option A: Docker (recommended)**

```bash
docker compose up -d
```

The service starts at `http://localhost:48002`. Check it with:

```bash
curl http://localhost:48002/health
```

**Option B: Python directly**

```bash
cd sarvam-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 48002
```

### Step 2 — Install the VS Code extension

```bash
cd vscode-extension
npm install
npm run package          # produces speak-desi-1.0.0.vsix
code --install-extension speak-desi-1.0.0.vsix
```

Then **reload VS Code** (`Cmd+Shift+P` → "Reload Window").

---

## Usage

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Start / stop recording | `Cmd+Shift+Space` | `Ctrl+Shift+Space` |

You can also click the **"Speak Desi"** button in the VS Code status bar (bottom-right).

**Workflow:**
1. Place your cursor where you want the text (editor, chat panel, terminal, etc.)
2. Press `Cmd+Shift+Space` — status bar turns red and shows "🎤 Recording..."
3. Speak
4. Press `Cmd+Shift+Space` again — audio is sent to Sarvam, text is inserted at cursor

The extension remembers which panel was focused when you started recording and restores focus before pasting, so clicking the status bar button works correctly even with multiple split panels open.

---

## Configuration

Open VS Code settings (`Cmd+,`) and search for **"Speak Desi"**, or add these to your `settings.json`:

```json
{
  "sarvamVoiceToText.serviceUrl": "http://localhost:48002",
  "sarvamVoiceToText.language": "unknown"
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `sarvamVoiceToText.serviceUrl` | `http://localhost:48002` | URL of the running Sarvam service |
| `sarvamVoiceToText.language` | `unknown` | BCP-47 language code. `unknown` = auto-detect. Examples: `en-IN`, `hi-IN`, `kn-IN`, `ta-IN`, `te-IN` |

---

## Troubleshooting

**"sox not found"**
Install SoX — see Prerequisites above.

**"Sarvam service is not running"**
Start the service: `docker compose up -d` or `uvicorn main:app --port 48002` inside `sarvam-service/`.

**"Transcription failed: SARVAM_API_KEY is not configured"**
Make sure `.env` exists with your key and the service was restarted after you added it.

**"No speech detected"**
- Speak clearly and closer to the microphone
- Check system microphone permissions (System Settings → Privacy → Microphone on macOS)
- Try a short test recording first

---

## Development

To iterate on the extension without packaging:

```bash
cd vscode-extension
npm install
npm run watch          # keep TypeScript compiler running
```

Then open the `vscode-extension` folder in VS Code and press **F5** to launch an Extension Development Host with the extension loaded.

---

## Project Structure

```
speak-claude-sarvam/
├── sarvam-service/        Python FastAPI service (calls Sarvam API)
│   ├── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── vscode-extension/      VS Code extension (TypeScript)
│   └── src/extension.ts
├── examples/              Raw Sarvam SDK usage examples
├── docker-compose.yml
└── .env                   Your API key (never committed)
```

---

## License

MIT
