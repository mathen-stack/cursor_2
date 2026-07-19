using LiveCaptions.App.Speech;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace LiveCaptions.App.Audio;

public sealed class LoopbackAudioCapture : IAsyncDisposable
{
    private WasapiLoopbackCapture? _capture;
    private CancellationTokenSource? _pumpCancellation;
    private Task? _pumpTask;
    private ISpeechTranscriber? _transcriber;
    private MMDevice? _device;

    public event Action<string>? Error;

    public IReadOnlyList<AudioDeviceInfo> GetActiveRenderDevices()
    {
        using var enumerator = new MMDeviceEnumerator();
        var result = new List<AudioDeviceInfo>();
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            result.Add(new AudioDeviceInfo(device.ID, device.FriendlyName));
            device.Dispose();
        }

        return result;
    }

    public Task StartAsync(string? deviceId, ISpeechTranscriber transcriber)
    {
        if (_capture is not null)
        {
            return Task.CompletedTask;
        }

        using var enumerator = new MMDeviceEnumerator();
        _device = string.IsNullOrWhiteSpace(deviceId)
            ? enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)
            : enumerator.GetDevice(deviceId);

        _transcriber = transcriber;
        _capture = new WasapiLoopbackCapture(_device);
        var buffered = new BufferedWaveProvider(_capture.WaveFormat)
        {
            BufferDuration = TimeSpan.FromSeconds(3),
            DiscardOnBufferOverflow = true,
            ReadFully = false
        };

        _capture.DataAvailable += (_, args) => buffered.AddSamples(args.Buffer, 0, args.BytesRecorded);
        _capture.RecordingStopped += (_, args) =>
        {
            if (args.Exception is not null)
            {
                Error?.Invoke(args.Exception.Message);
            }
        };

        ISampleProvider samples = buffered.ToSampleProvider();
        samples = new DownmixToMonoSampleProvider(samples);
        if (samples.WaveFormat.SampleRate != 16_000)
        {
            samples = new WdlResamplingSampleProvider(samples, 16_000);
        }

        var pcm16 = new SampleToWaveProvider16(samples);
        _pumpCancellation = new CancellationTokenSource();
        _pumpTask = PumpAudioAsync(pcm16, _pumpCancellation.Token);
        _capture.StartRecording();
        return Task.CompletedTask;
    }

    public async Task StopAsync()
    {
        var capture = _capture;
        _capture = null;
        capture?.StopRecording();

        if (_pumpCancellation is not null)
        {
            _pumpCancellation.Cancel();
        }

        if (_pumpTask is not null)
        {
            try
            {
                await _pumpTask;
            }
            catch (OperationCanceledException)
            {
                // Normal shutdown.
            }
        }

        capture?.Dispose();
        _device?.Dispose();
        _device = null;
        _pumpCancellation?.Dispose();
        _pumpCancellation = null;
        _pumpTask = null;
        _transcriber = null;
    }

    public async ValueTask DisposeAsync() => await StopAsync();

    private async Task PumpAudioAsync(IWaveProvider provider, CancellationToken cancellationToken)
    {
        var buffer = new byte[3_200]; // 100 ms of 16 kHz, 16-bit mono PCM.

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var count = provider.Read(buffer, 0, buffer.Length);
                if (count > 0)
                {
                    _transcriber?.WriteAudio(buffer, count);
                }
                else
                {
                    await Task.Delay(10, cancellationToken);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
        catch (Exception ex)
        {
            Error?.Invoke(ex.Message);
        }
    }
}
