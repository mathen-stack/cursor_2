using System.Text;

namespace LiveCaptions.Core;

/// <summary>
/// Maintains finalized caption history separately from the current recognition hypothesis.
/// </summary>
public sealed class CaptionTranscript
{
    private readonly int _maximumCharacters;
    private readonly List<string> _finalized = [];
    private string _partial = string.Empty;

    public CaptionTranscript(int maximumCharacters = 12_000)
    {
        if (maximumCharacters < 100)
        {
            throw new ArgumentOutOfRangeException(
                nameof(maximumCharacters),
                "Transcript capacity must be at least 100 characters.");
        }

        _maximumCharacters = maximumCharacters;
    }

    public string Text => Compose(includePartial: true);

    public string FinalizedText => Compose(includePartial: false);

    public void UpdatePartial(string? text) =>
        _partial = LimitLength(Normalize(text));

    public void FinalizeCaption(string? text)
    {
        var normalized = LimitLength(Normalize(text));
        _partial = string.Empty;

        if (normalized.Length == 0)
        {
            return;
        }

        _finalized.Add(normalized);
        TrimToCapacity();
    }

    public void Clear()
    {
        _finalized.Clear();
        _partial = string.Empty;
    }

    private string Compose(bool includePartial)
    {
        var builder = new StringBuilder();
        foreach (var caption in _finalized)
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
            }

            builder.Append(caption);
        }

        if (includePartial && _partial.Length > 0)
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
            }

            builder.Append(_partial);
        }

        return builder.ToString();
    }

    private void TrimToCapacity()
    {
        while (_finalized.Count > 1 && FinalizedText.Length > _maximumCharacters)
        {
            _finalized.RemoveAt(0);
        }
    }

    private static string Normalize(string? value) =>
        string.Join(' ', (value ?? string.Empty)
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    private string LimitLength(string value) =>
        value.Length <= _maximumCharacters
            ? value
            : value[^_maximumCharacters..];
}
