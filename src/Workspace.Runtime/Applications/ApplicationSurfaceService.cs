using Workspace.Core.World;

namespace Workspace.Runtime.Applications;

/// <summary>Session-owned capture and input. Persistent selectors are not control grants.</summary>
public sealed class ApplicationSurfaceService : IAsyncDisposable
{
    private readonly IApplicationPlatform _platform;
    private readonly TimeProvider _clock;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Dictionary<string, CaptureBinding> _captures = new(StringComparer.Ordinal);
    private readonly Dictionary<string, DiscoveredWindow> _selected = new(StringComparer.Ordinal);
    private readonly CancellationTokenSource _stopping = new();
    private readonly Task _watchdog;
    private ControlLease? _control;
    private const int MaximumCaptures = 8;
    private static readonly TimeSpan ControlDuration = TimeSpan.FromSeconds(15);
    private bool _disposed;

    public ApplicationSurfaceService(IApplicationPlatform platform, TimeProvider? clock = null)
    {
        _platform = platform;
        _clock = clock ?? TimeProvider.System;
        _watchdog = WatchAsync(_stopping.Token);
    }

    public string Status => _platform.Status;
    public Task<IReadOnlyList<DiscoveredWindow>> DiscoverAsync(CancellationToken token) => _platform.DiscoverAsync(token);

    public async Task<DiscoveredWindow> SelectWindowAsync(string windowId, CancellationToken token) =>
        (await _platform.DiscoverAsync(token)).SingleOrDefault(w => string.Equals(w.Id, windowId, StringComparison.Ordinal))
        ?? throw new PlatformOperationException("stale_window_id");

    public async Task BindSelectedAsync(string entityId, DiscoveredWindow window, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            await StopCaptureCoreAsync(entityId, token);
            if (_control?.EntityId == entityId) await ReleaseControlCoreAsync(token);
            _selected[entityId] = window;
        }
        finally { _gate.Release(); }
    }

    public async Task<SurfaceRead> ReadFrameAsync(WorldEntity entity, long afterSequence, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_disposed) return new("stopped");
            var selector = WindowSelector.FromEntity(entity);
            if (selector is null) return new("unbound");
            var window = await ResolveAsync(entity, token);
            if (window is null)
            {
                await StopCaptureCoreAsync(entity.Id, token);
                return new("window_missing_or_ambiguous");
            }
            if (window.IsMinimized)
            {
                await StopCaptureCoreAsync(entity.Id, token);
                return new("window_minimized");
            }
            if (!window.CanCapture) return new(window.Restriction ?? "capture_unavailable");
            if (_captures.TryGetValue(entity.Id, out var old) && (old.WindowId != window.Id || old.Selector != selector))
                await StopCaptureCoreAsync(entity.Id, token);
            if (!_captures.TryGetValue(entity.Id, out var capture))
            {
                if (_captures.Count >= MaximumCaptures) return new("capture_limit");
                var streamId = await _platform.StartCaptureAsync(window.Id, token);
                capture = new(streamId, window.Id, selector, _clock.GetUtcNow(), false);
                _captures.Add(entity.Id, capture);
                // A recreated capture starts a new sequence epoch.
                afterSequence = 0;
            }
            _captures[entity.Id] = capture with { LastRead = _clock.GetUtcNow() };
            var frame = await _platform.ReadFrameAsync(capture.StreamId, afterSequence, token);
            if (frame is null) return new(capture.HasFrame ? "idle" : "waiting_for_frame");
            if (frame.Width is < 1 or > 8192 || frame.Height is < 1 or > 8192 || frame.Data.Length > 16 * 1024 * 1024 || frame.MimeType is not ("image/png" or "image/jpeg"))
                throw new PlatformOperationException("capture_frame_limit");
            _captures[entity.Id] = capture with { LastRead = _clock.GetUtcNow(), HasFrame = true };
            return new("live", frame);
        }
        catch (PlatformOperationException error) { return new(error.Code); }
        finally { _gate.Release(); }
    }

    public async Task<ControlLease> AcquireControlAsync(WorldEntity entity, string sessionId, string mode, CancellationToken token)
    {
        if (mode is not ("messages" or "foreground")) throw new PlatformOperationException("invalid_input_mode");
        await _gate.WaitAsync(token);
        try
        {
            var window = await ResolveAsync(entity, token) ?? throw new PlatformOperationException("window_missing_or_ambiguous");
            if (window.IsMinimized) throw new PlatformOperationException("window_minimized");
            await ReleaseControlCoreAsync(token);
            _control = new($"control:{Guid.NewGuid():N}", sessionId, entity.Id, window.Id, mode, _clock.GetUtcNow() + ControlDuration);
            return _control;
        }
        finally { _gate.Release(); }
    }

    public async Task InputAsync(WorldEntity entity, string sessionId, string leaseId, SurfaceInput input, CancellationToken token)
    {
        SurfaceInput.Validate(input);
        await _gate.WaitAsync(token);
        try
        {
            if (_control is null || _control.SessionId != sessionId || _control.EntityId != entity.Id || _control.Id != leaseId)
                throw new PlatformOperationException("control_not_authorized");
            if (_control.ExpiresAt <= _clock.GetUtcNow())
            {
                await ReleaseControlCoreAsync(token);
                throw new PlatformOperationException("control_expired");
            }
            var window = await ResolveAsync(entity, token);
            if (window is null || window.Id != _control.WindowId)
            {
                await ReleaseControlCoreAsync(token);
                throw new PlatformOperationException("control_target_changed");
            }
            await _platform.InputAsync(window.Id, input, _control.Mode, token);
            _control = _control with { ExpiresAt = _clock.GetUtcNow() + ControlDuration };
        }
        finally { _gate.Release(); }
    }

    public async Task FocusAsync(WorldEntity entity, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            var window = await ResolveAsync(entity, token) ?? throw new PlatformOperationException("window_missing_or_ambiguous");
            await ReleaseControlCoreAsync(token);
            await _platform.FocusAsync(window.Id, token);
        }
        finally { _gate.Release(); }
    }

    public async Task ReleaseSessionAsync(string sessionId, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try { if (_control?.SessionId == sessionId) await ReleaseControlCoreAsync(token); }
        finally { _gate.Release(); }
    }

    public async Task ReleaseSurfaceAsync(string entityId, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_control?.EntityId == entityId) await ReleaseControlCoreAsync(token);
            await StopCaptureCoreAsync(entityId, token);
            _selected.Remove(entityId);
        }
        finally { _gate.Release(); }
    }

    private async Task<DiscoveredWindow?> ResolveAsync(WorldEntity entity, CancellationToken token)
    {
        var selector = WindowSelector.FromEntity(entity);
        if (selector is null) return null;
        var windows = await _platform.DiscoverAsync(token);
        if (_selected.TryGetValue(entity.Id, out var selected) && selected.Selector == selector)
        {
            var current = windows.SingleOrDefault(w => w.Id == selected.Id && w.Selector.ApplicationId == selector.ApplicationId);
            if (current is not null) return current;
        }
        return WindowSelector.Match(selector, windows);
    }

    private async Task StopCaptureCoreAsync(string entityId, CancellationToken token)
    {
        if (_captures.Remove(entityId, out var capture)) await _platform.StopCaptureAsync(capture.StreamId, token);
    }

    private async Task ReleaseControlCoreAsync(CancellationToken token)
    {
        _control = null;
        await _platform.ReleaseInputAsync(token);
    }

    private async Task WatchAsync(CancellationToken token)
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
            while (await timer.WaitForNextTickAsync(token))
            {
                await _gate.WaitAsync(token);
                try
                {
                    if (_control?.ExpiresAt <= _clock.GetUtcNow()) await ReleaseControlCoreAsync(CancellationToken.None);
                    foreach (var id in _captures.Where(p => _clock.GetUtcNow() - p.Value.LastRead > TimeSpan.FromSeconds(20)).Select(p => p.Key).ToArray())
                        await StopCaptureCoreAsync(id, CancellationToken.None);
                }
                catch (Exception) when (!token.IsCancellationRequested) { /* A dead native target cannot kill cleanup for other surfaces. */ }
                finally { _gate.Release(); }
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        _stopping.Cancel();
        await _watchdog;
        await _gate.WaitAsync();
        try
        {
            await ReleaseControlCoreAsync(CancellationToken.None);
            foreach (var id in _captures.Keys.ToArray()) await StopCaptureCoreAsync(id, CancellationToken.None);
            await _platform.DisposeAsync();
        }
        finally { _gate.Release(); _stopping.Dispose(); }
    }

    private sealed record CaptureBinding(string StreamId, string WindowId, WindowSelector Selector, DateTimeOffset LastRead, bool HasFrame);
}
