using Microsoft.CognitiveServices.Speech;
using Microsoft.CognitiveServices.Speech.Audio;

namespace LiveCaptions.App.Speech;

public sealed class AzureSpeechTranscriber : ISpeechTranscriber
{
    private PushAudioInputStream? _audioStream;
    private AudioConfig? _audioConfig;
    private SpeechRecognizer? _recognizer;
    private TaskCompletionSource _sessionEnded =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private bool _isRunning;

    public event Action<string>? PartialCaption;
    public event Action<string>? FinalCaption;
    public event Action<string>? Error;

    public async Task StartAsync(string subscriptionKey, string region, string language)
    {
        if (_isRunning)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(subscriptionKey))
        {
            throw new ArgumentException("An Azure Speech subscription key is required.", nameof(subscriptionKey));
        }

        var speechConfig = SpeechConfig.FromSubscription(subscriptionKey.Trim(), region.Trim());
        speechConfig.SpeechRecognitionLanguage = language;
        speechConfig.OutputFormat = OutputFormat.Detailed;
        speechConfig.SetProfanity(ProfanityOption.Raw);
        speechConfig.SetProperty(
            PropertyId.SpeechServiceResponse_StablePartialResultThreshold,
            "3");
        speechConfig.EnableDictation();

        var format = AudioStreamFormat.GetWaveFormatPCM(16_000, 16, 1);
        _audioStream = AudioInputStream.CreatePushStream(format);
        _audioConfig = AudioConfig.FromStreamInput(_audioStream);
        _recognizer = new SpeechRecognizer(speechConfig, _audioConfig);
        _recognizer.Recognizing += OnRecognizing;
        _recognizer.Recognized += OnRecognized;
        _recognizer.Canceled += OnCanceled;
        _recognizer.SessionStopped += OnSessionStopped;
        _sessionEnded = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);

        try
        {
            await _recognizer.StartContinuousRecognitionAsync();
            _isRunning = true;
        }
        catch
        {
            await DisposeRecognizerAsync();
            throw;
        }
    }

    public void WriteAudio(byte[] buffer, int count)
    {
        if (_isRunning && count > 0)
        {
            if (count == buffer.Length)
            {
                _audioStream?.Write(buffer);
                return;
            }

            var audio = new byte[count];
            Buffer.BlockCopy(buffer, 0, audio, 0, count);
            _audioStream?.Write(audio);
        }
    }

    public async Task StopAsync()
    {
        if (_recognizer is not null && _isRunning)
        {
            _isRunning = false;
            _audioStream?.Close();
            await _recognizer.StopContinuousRecognitionAsync();
            await Task.WhenAny(_sessionEnded.Task, Task.Delay(TimeSpan.FromSeconds(2)));
        }

        await DisposeRecognizerAsync();
    }

    public async ValueTask DisposeAsync() => await StopAsync();

    private void OnRecognizing(object? sender, SpeechRecognitionEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(e.Result.Text))
        {
            PartialCaption?.Invoke(e.Result.Text);
        }
    }

    private void OnRecognized(object? sender, SpeechRecognitionEventArgs e)
    {
        if (e.Result.Reason == ResultReason.RecognizedSpeech &&
            !string.IsNullOrWhiteSpace(e.Result.Text))
        {
            FinalCaption?.Invoke(e.Result.Text);
        }
    }

    private void OnCanceled(object? sender, SpeechRecognitionCanceledEventArgs e)
    {
        _sessionEnded.TrySetResult();
        if (e.Reason == CancellationReason.Error)
        {
            Error?.Invoke($"{e.ErrorCode}: {e.ErrorDetails}");
        }
    }

    private void OnSessionStopped(object? sender, SessionEventArgs e) =>
        _sessionEnded.TrySetResult();

    private Task DisposeRecognizerAsync()
    {
        if (_recognizer is not null)
        {
            _recognizer.Recognizing -= OnRecognizing;
            _recognizer.Recognized -= OnRecognized;
            _recognizer.Canceled -= OnCanceled;
            _recognizer.SessionStopped -= OnSessionStopped;
            _recognizer.Dispose();
            _recognizer = null;
        }

        _audioConfig?.Dispose();
        _audioConfig = null;
        _audioStream?.Dispose();
        _audioStream = null;
        return Task.CompletedTask;
    }
}
