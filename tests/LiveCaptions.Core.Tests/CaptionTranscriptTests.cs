using LiveCaptions.Core;
using Xunit;

namespace LiveCaptions.Core.Tests;

public sealed class CaptionTranscriptTests
{
    [Fact]
    public void PartialCaptionIsReplacedWithoutDuplicatingText()
    {
        var transcript = new CaptionTranscript();

        transcript.UpdatePartial("Hello");
        transcript.UpdatePartial("Hello there");

        Assert.Equal("Hello there", transcript.Text);
        Assert.Equal(string.Empty, transcript.FinalizedText);
    }

    [Fact]
    public void FinalCaptionReplacesPartialAndPreservesHistory()
    {
        var transcript = new CaptionTranscript();
        transcript.UpdatePartial("How are");
        transcript.FinalizeCaption("How are you?");
        transcript.UpdatePartial("I am");

        Assert.Equal($"How are you?{Environment.NewLine}I am", transcript.Text);
        Assert.Equal("How are you?", transcript.FinalizedText);
    }

    [Fact]
    public void CaptionsAreWhitespaceNormalized()
    {
        var transcript = new CaptionTranscript();

        transcript.FinalizeCaption("  This   has \r\n extra whitespace.  ");

        Assert.Equal("This has extra whitespace.", transcript.Text);
    }

    [Fact]
    public void OldCaptionsAreRemovedAtCapacity()
    {
        var transcript = new CaptionTranscript(100);
        transcript.FinalizeCaption(new string('a', 60));
        transcript.FinalizeCaption(new string('b', 60));

        Assert.Equal(new string('b', 60), transcript.Text);
    }

    [Fact]
    public void ClearRemovesFinalAndPartialCaptions()
    {
        var transcript = new CaptionTranscript();
        transcript.FinalizeCaption("Final.");
        transcript.UpdatePartial("Partial");

        transcript.Clear();

        Assert.Equal(string.Empty, transcript.Text);
    }
}
