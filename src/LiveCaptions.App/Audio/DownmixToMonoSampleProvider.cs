using NAudio.Wave;

namespace LiveCaptions.App.Audio;

internal sealed class DownmixToMonoSampleProvider : ISampleProvider
{
    private readonly ISampleProvider _source;
    private readonly int _channels;
    private float[] _sourceBuffer = [];

    public DownmixToMonoSampleProvider(ISampleProvider source)
    {
        _source = source;
        _channels = source.WaveFormat.Channels;
        WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(source.WaveFormat.SampleRate, 1);
    }

    public WaveFormat WaveFormat { get; }

    public int Read(float[] buffer, int offset, int count)
    {
        var required = count * _channels;
        if (_sourceBuffer.Length < required)
        {
            _sourceBuffer = new float[required];
        }

        var samplesRead = _source.Read(_sourceBuffer, 0, required);
        var framesRead = samplesRead / _channels;
        for (var frame = 0; frame < framesRead; frame++)
        {
            var sum = 0f;
            for (var channel = 0; channel < _channels; channel++)
            {
                sum += _sourceBuffer[(frame * _channels) + channel];
            }

            buffer[offset + frame] = Math.Clamp(sum / _channels, -1f, 1f);
        }

        return framesRead;
    }
}
