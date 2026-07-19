using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using LiveCaptions.App.Audio;
using LiveCaptions.App.Configuration;
using LiveCaptions.App.Speech;
using LiveCaptions.Core;

namespace LiveCaptions.App;

public partial class MainWindow : Window
{
    private readonly SettingsStore _settingsStore = new();
    private readonly CaptionTranscript _transcript = new();
    private readonly LoopbackAudioCapture _audioCapture = new();
    private readonly AzureSpeechTranscriber _transcriber = new();
    private AppSettings _settings = new();
    private bool _isRunning;
    private bool _isStopping;
    private bool _allowClose;
    private bool _closing;
    private bool _renderPending;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
        CaptionText.LostKeyboardFocus += (_, _) =>
        {
            if (_renderPending)
            {
                RenderTranscript(force: true);
            }
        };

        _transcriber.PartialCaption += text => Dispatcher.InvokeAsync(() =>
        {
            _transcript.UpdatePartial(text);
            RenderTranscript();
        });
        _transcriber.FinalCaption += text => Dispatcher.InvokeAsync(() =>
        {
            _transcript.FinalizeCaption(text);
            RenderTranscript();
        });
        _transcriber.Error += error => Dispatcher.InvokeAsync(
            () => HandleRuntimeErrorAsync($"Speech error: {error}"));
        _audioCapture.Error += error => Dispatcher.InvokeAsync(
            () => HandleRuntimeErrorAsync($"Audio error: {error}"));
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        _settings = await _settingsStore.LoadAsync();
        PopulateDevices();
        ApplySettingsToControls();

        var environmentKey = Environment.GetEnvironmentVariable("AZURE_SPEECH_KEY");
        if (!string.IsNullOrWhiteSpace(environmentKey))
        {
            SpeechKeyBox.Password = environmentKey;
        }

        if (_settings.StartAutomatically && !string.IsNullOrWhiteSpace(SpeechKeyBox.Password))
        {
            await StartCaptionsAsync();
        }
    }

    private void PopulateDevices()
    {
        try
        {
            var devices = _audioCapture.GetActiveRenderDevices();
            DeviceCombo.ItemsSource = devices;
            DeviceCombo.SelectedItem = devices.FirstOrDefault(
                device => device.Id == _settings.OutputDeviceId) ?? devices.FirstOrDefault();
        }
        catch (Exception ex)
        {
            SetStatus($"Could not list output devices: {ex.Message}", isError: true);
        }
    }

    private void ApplySettingsToControls()
    {
        RegionTextBox.Text = _settings.AzureRegion;
        LanguageCombo.Text = _settings.RecognitionLanguage;
        FontSizeSlider.Value = Math.Clamp(_settings.FontSize, 18, 52);
        AutoStartCheckBox.IsChecked = _settings.StartAutomatically;
        CaptionText.FontSize = FontSizeSlider.Value;
    }

    private async void StartStopButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isRunning)
        {
            await StopCaptionsAsync();
        }
        else
        {
            await StartCaptionsAsync();
        }
    }

    private async Task StartCaptionsAsync()
    {
        var key = SpeechKeyBox.Password;
        var region = RegionTextBox.Text.Trim();
        var language = LanguageCombo.Text.Trim();

        if (string.IsNullOrWhiteSpace(key))
        {
            SetStatus("Enter an Azure Speech key in Settings.", isError: true);
            SettingsPanel.Visibility = Visibility.Visible;
            return;
        }

        if (string.IsNullOrWhiteSpace(region) || string.IsNullOrWhiteSpace(language))
        {
            SetStatus("Azure region and recognition language are required.", isError: true);
            SettingsPanel.Visibility = Visibility.Visible;
            return;
        }

        StartStopButton.IsEnabled = false;
        SetStatus("Connecting…");

        try
        {
            await SaveSettingsAsync();
            await _transcriber.StartAsync(key, region, language);
            var device = DeviceCombo.SelectedItem as AudioDeviceInfo;
            await _audioCapture.StartAsync(device?.Id, _transcriber);
            _isRunning = true;
            StartStopButton.Content = "Stop";
            SettingsPanel.Visibility = Visibility.Collapsed;
            SetStatus($"Listening to {device?.Name ?? "default output"}");
            StateIndicator.Fill = new SolidColorBrush(Color.FromRgb(72, 199, 142));

            if (_transcript.Text.Length == 0)
            {
                CaptionText.Text = "Play audio in any Windows app. Captions will appear here.";
            }
        }
        catch (Exception ex)
        {
            await StopServicesBestEffortAsync();
            SetStatus($"Could not start: {ex.Message}", isError: true);
        }
        finally
        {
            StartStopButton.IsEnabled = true;
        }
    }

    private async Task StopCaptionsAsync()
    {
        if (_isStopping)
        {
            return;
        }

        _isStopping = true;
        StartStopButton.IsEnabled = false;
        SetStatus("Stopping…");

        try
        {
            var failure = await StopServicesBestEffortAsync();
            if (failure is not null)
            {
                SetStatus($"Could not stop cleanly: {failure.Message}", isError: true);
                return;
            }
        }
        finally
        {
            _isRunning = false;
            _isStopping = false;
            StartStopButton.Content = "Start";
            StartStopButton.IsEnabled = true;
            StateIndicator.Fill = new SolidColorBrush(Color.FromRgb(136, 146, 166));
            if (!StatusText.Text.StartsWith("Could not", StringComparison.Ordinal))
            {
                SetStatus("Stopped");
            }
        }
    }

    private async Task<Exception?> StopServicesBestEffortAsync()
    {
        Exception? failure = null;
        try
        {
            await _audioCapture.StopAsync();
        }
        catch (Exception ex)
        {
            failure = ex;
        }

        try
        {
            await _transcriber.StopAsync();
        }
        catch (Exception ex)
        {
            failure ??= ex;
        }

        return failure;
    }

    private async Task HandleRuntimeErrorAsync(string message)
    {
        if (_isRunning && !_isStopping)
        {
            await StopCaptionsAsync();
        }

        SetStatus(message, isError: true);
    }

    private void RenderTranscript(bool force = false)
    {
        if (!force && CaptionText.SelectionLength > 0)
        {
            _renderPending = true;
            return;
        }

        _renderPending = false;
        CaptionText.Text = _transcript.Text;
        CaptionText.CaretIndex = CaptionText.Text.Length;
        CaptionText.ScrollToEnd();
    }

    private void ClearButton_Click(object sender, RoutedEventArgs e)
    {
        _transcript.Clear();
        CaptionText.Clear();
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        var text = _transcript.Text;
        if (!string.IsNullOrWhiteSpace(text))
        {
            Clipboard.SetText(text);
            SetStatus("Transcript copied");
        }
    }

    private void SettingsButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsPanel.Visibility = SettingsPanel.Visibility == Visibility.Visible
            ? Visibility.Collapsed
            : Visibility.Visible;
    }

    private async void SaveSettingsButton_Click(object sender, RoutedEventArgs e)
    {
        await SaveSettingsAsync();
        SettingsPanel.Visibility = Visibility.Collapsed;
        SetStatus("Settings saved");
    }

    private async Task SaveSettingsAsync()
    {
        _settings.AzureRegion = RegionTextBox.Text.Trim();
        _settings.RecognitionLanguage = LanguageCombo.Text.Trim();
        _settings.OutputDeviceId = (DeviceCombo.SelectedItem as AudioDeviceInfo)?.Id;
        _settings.FontSize = FontSizeSlider.Value;
        _settings.StartAutomatically = AutoStartCheckBox.IsChecked == true;
        await _settingsStore.SaveAsync(_settings);
    }

    private void FontSizeSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (CaptionText is null || FontSizeValue is null)
        {
            return;
        }

        CaptionText.FontSize = e.NewValue;
        FontSizeValue.Text = $"{e.NewValue:0}px";
    }

    private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left)
        {
            DragMove();
        }
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e) =>
        WindowState = WindowState.Minimized;

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private async void MainWindow_Closing(object? sender, CancelEventArgs e)
    {
        if (_allowClose)
        {
            return;
        }

        e.Cancel = true;
        if (_closing)
        {
            return;
        }

        _closing = true;
        try
        {
            if (_isRunning)
            {
                await StopCaptionsAsync();
            }

            await _transcriber.DisposeAsync();
            await _audioCapture.DisposeAsync();
        }
        catch (Exception ex)
        {
            SetStatus($"Shutdown error: {ex.Message}", isError: true);
        }
        finally
        {
            _allowClose = true;
            Dispatcher.BeginInvoke(Close);
        }
    }

    private void SetStatus(string text, bool isError = false)
    {
        StatusText.Text = text;
        StatusText.Foreground = new SolidColorBrush(
            isError ? Color.FromRgb(255, 125, 125) : Color.FromRgb(127, 139, 160));
        if (isError)
        {
            StateIndicator.Fill = new SolidColorBrush(Color.FromRgb(255, 100, 100));
        }
    }
}
