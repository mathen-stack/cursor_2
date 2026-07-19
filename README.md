# Output Live Captions

A selectable, always-on-top Windows caption overlay that transcribes only audio
playing through a Windows output device. It does not open or capture a
microphone.

## Features

- WASAPI loopback capture for system/output audio only
- Streaming partial and final captions
- Azure Speech dictation mode for punctuation and sentence formatting
- Selectable caption text, standard `Ctrl+C`, and a **Copy all** button
- Always-on-top, draggable, resizable overlay
- Output-device and recognition-language selection
- No Azure key stored on disk
- Bounded caption history to prevent unbounded memory growth

## Requirements

- Windows 10 version 2004 or later, or Windows 11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- An [Azure AI Speech](https://azure.microsoft.com/products/ai-services/ai-speech)
  resource key and region

## Run

```powershell
git clone <repository-url>
cd cursor_2
$env:AZURE_SPEECH_KEY = "your-key" # optional; it can be entered in Settings
dotnet restore
dotnet run --project .\src\LiveCaptions.App
```

Open **Settings**, choose the output device used by Chrome or the media app,
enter the Azure region and key, then press **Start**. The subscription key is
kept only in process memory. Region, language, device, font size, and auto-start
preference are saved under `%LOCALAPPDATA%\OutputLiveCaptions`.

To publish a standalone Windows executable:

```powershell
dotnet publish .\src\LiveCaptions.App -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -o .\publish
```

Run tests with:

```powershell
dotnet test
```

## Audio and privacy behavior

The app uses the selected render endpoint's WASAPI loopback stream. It never
requests microphone permission and never creates a microphone capture stream.
In a normal headset meeting this captures the other participant, not your
voice. If Windows or the meeting software intentionally plays your microphone
back through the selected output device (sidetone/monitoring), that playback is
part of system output and will also be captioned.

Audio is streamed to Azure Speech for recognition and is subject to the Azure
resource's billing, data-handling, and network requirements. This is not an
offline caption engine.

## Caption accuracy

Azure Speech dictation mode adds punctuation and casing. Select the exact spoken
language for best results. No speech recognizer can guarantee correct grammar,
especially with crosstalk, names, accents, or poor source audio.

## Architecture

- `LiveCaptions.App/Audio`: output device enumeration, WASAPI loopback capture,
  channel downmixing, and 16 kHz PCM resampling
- `LiveCaptions.App/Speech`: streaming Azure Speech adapter
- `LiveCaptions.Core`: provider-independent transcript state
- `LiveCaptions.Core.Tests`: transcript behavior tests
