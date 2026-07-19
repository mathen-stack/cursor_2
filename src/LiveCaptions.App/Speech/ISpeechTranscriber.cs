namespace LiveCaptions.App.Speech;

public interface ISpeechTranscriber : IAsyncDisposable
{
    event Action<string>? PartialCaption;

    event Action<string>? FinalCaption;

    event Action<string>? Error;

    Task StartAsync(string subscriptionKey, string region, string language);

    void WriteAudio(byte[] buffer, int count);

    Task StopAsync();
}
