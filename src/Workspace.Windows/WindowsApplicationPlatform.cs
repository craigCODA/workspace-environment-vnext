using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Workspace.Runtime.Applications;
using Workspace.Windows.Native;

namespace Workspace.Windows;

/// <summary>One generic Windows path for all discovered application windows.</summary>
public sealed class WindowsApplicationPlatform : IApplicationPlatform
{
    private readonly int? _desktopProcessId;
    private readonly Lazy<IWindowCapture> _capture = new(() => new GraphicsCaptureWindowCapture());
    private readonly Win32InputRouter _foreground = new();
    private readonly WindowMessageInputRouter _messages = new();
    public string Status => "available";

    public WindowsApplicationPlatform(int? desktopProcessId = null)
    {
        _desktopProcessId = desktopProcessId;
        SetProcessDpiAwarenessContext(new nint(-4));
    }

    public Task<IReadOnlyList<DiscoveredWindow>> DiscoverAsync(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyList<DiscoveredWindow>>(DiscoverNative().Select(w => w.Info).ToArray());
    }

    public async Task<string> StartCaptureAsync(string windowId, CancellationToken token)
    {
        var window = Resolve(windowId);
        if (window.Info.IsMinimized) throw new PlatformOperationException("window_minimized");
        if (!window.Info.CanCapture) throw new PlatformOperationException(window.Info.Restriction ?? "capture_unavailable");
        try { return (await _capture.Value.StartAsync(window.Hwnd, token)).StreamId; }
        catch (OperationCanceledException) { throw; }
        catch { throw new PlatformOperationException("capture_unavailable"); }
    }

    public async ValueTask<WindowFrame?> ReadFrameAsync(string streamId, long afterSequence, CancellationToken token)
    {
        if (!_capture.IsValueCreated || !_capture.Value.ActiveStreamIds.Contains(streamId)) throw new PlatformOperationException("capture_stopped");
        var frame = await _capture.Value.ReadLatestFrameAsync(streamId, afterSequence, token);
        return frame is null ? null : new(frame.Sequence, frame.Width, frame.Height, frame.MimeType, frame.Data);
    }

    public Task StopCaptureAsync(string streamId, CancellationToken token) => _capture.IsValueCreated ? _capture.Value.StopAsync(streamId, token) : Task.CompletedTask;

    public async Task InputAsync(string windowId, SurfaceInput input, string mode, CancellationToken token)
    {
        SurfaceInput.Validate(input);
        var window = Resolve(windowId);
        if (window.Info.IsMinimized) throw new PlatformOperationException("window_minimized");
        var intent = new WindowInputIntent(input.Kind, input.Phase, input.X, input.Y, input.Button, input.DeltaX, input.DeltaY, input.Key, input.Text);
        try
        {
            if (mode == "messages") _messages.Route(window.Hwnd, window.Bounds, intent);
            else if (mode == "foreground") await _foreground.RouteAsync(new WindowSnapshot(window.Hwnd, window.ProcessId, window.Info.Title, window.Bounds, true, false, window.Info.Selector.ApplicationId), intent, token);
            else throw new PlatformOperationException("invalid_input_mode");
        }
        catch (InputTargetNotPermittedException) { throw new PlatformOperationException("input_denied_use_native_window"); }
        catch (ArgumentException) { throw new PlatformOperationException("input_not_supported_use_native_window"); }
    }

    public Task FocusAsync(string windowId, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var target = Resolve(windowId);
        if (target.Info.IsMinimized) ShowWindowAsync(target.Hwnd, 9);
        if (!SetForegroundWindow(target.Hwnd)) throw new PlatformOperationException("focus_denied");
        return Task.CompletedTask;
    }

    public async Task ReleaseInputAsync(CancellationToken token)
    {
        _messages.ReleaseAll();
        await _foreground.ReleaseAllAsync(token);
    }

    public async ValueTask DisposeAsync()
    {
        await ReleaseInputAsync(CancellationToken.None);
        if (_capture.IsValueCreated) await _capture.Value.DisposeAsync();
    }

    private NativeWindow Resolve(string id) => DiscoverNative().SingleOrDefault(w => w.Info.Id == id) ?? throw new PlatformOperationException("stale_window_id");

    private IReadOnlyList<NativeWindow> DiscoverNative()
    {
        var windows = new List<NativeWindow>();
        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd)) return true;
            GetWindowThreadProcessId(hwnd, out var pid);
            if (pid == Environment.ProcessId || pid == _desktopProcessId) return true;
            var length = GetWindowTextLength(hwnd);
            if (length <= 0) return true;
            var title = new StringBuilder(Math.Min(length + 1, 4096));
            GetWindowText(hwnd, title, title.Capacity);
            if (string.IsNullOrWhiteSpace(title.ToString())) return true;
            var className = new StringBuilder(256);
            GetClassName(hwnd, className, className.Capacity);
            DwmGetWindowAttribute(hwnd, 14, out int cloaked, sizeof(int));
            if (cloaked != 0) return true;
            if (!GetWindowRect(hwnd, out var rect) || rect.Right <= rect.Left || rect.Bottom <= rect.Top) return true;
            if (DwmGetWindowAttribute(hwnd, 9, out NativeRect captureRect, Marshal.SizeOf<NativeRect>()) == 0 && captureRect.Right > captureRect.Left)
                rect = captureRect;
            try
            {
                using var process = Process.GetProcessById((int)pid);
                var name = process.ProcessName;
                var start = process.StartTime.ToUniversalTime().Ticks;
                string executable;
                try { executable = process.MainModule?.FileName ?? ""; } catch { executable = ""; }
                var applicationId = "app:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes((executable.Length > 0 ? executable : name).ToUpperInvariant()))).ToLowerInvariant();
                var id = $"window:{pid:x}:{start:x}:{hwnd.ToInt64():x}";
                var selector = new WindowSelector(applicationId, executable, className.ToString(), title.ToString());
                var restricted = GetWindowDisplayAffinity(hwnd, out var affinity) && affinity != 0;
                windows.Add(new NativeWindow(hwnd, (int)pid, new WindowBounds(rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top),
                    new DiscoveredWindow(id, title.ToString(), name, selector, IsIconic(hwnd), !restricted, restricted ? "capture_protected" : null)));
            }
            catch (InvalidOperationException) { }
            catch (System.ComponentModel.Win32Exception) { }
            catch (ArgumentException) { }
            return true;
        }, nint.Zero);
        return windows.OrderBy(w => w.Info.Application, StringComparer.OrdinalIgnoreCase).ThenBy(w => w.Info.Title, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private sealed record NativeWindow(nint Hwnd, int ProcessId, WindowBounds Bounds, DiscoveredWindow Info);
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    private delegate bool EnumWindowsProc(nint hwnd, nint data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, nint data);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint hwnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint hwnd, StringBuilder text, int maximum);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(nint hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint hwnd, StringBuilder text, int maximum);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint hwnd, out NativeRect rect);
    [DllImport("user32.dll")] private static extern bool GetWindowDisplayAffinity(nint hwnd, out uint affinity);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(nint hwnd, int command);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(nint context);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(nint hwnd, int attribute, out int value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(nint hwnd, int attribute, out NativeRect value, int size);
}
