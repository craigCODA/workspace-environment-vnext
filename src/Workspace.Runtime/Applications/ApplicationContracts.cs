using System.Text.Json;
using Workspace.Core.World;

namespace Workspace.Runtime.Applications;

public sealed record WindowSelector(string ApplicationId, string ExecutablePath, string WindowClass, string TitleHint)
{
    public static DiscoveredWindow? Match(WindowSelector selector, IReadOnlyList<DiscoveredWindow> windows)
    {
        var candidates = windows.Where(w => string.Equals(w.Selector.ApplicationId, selector.ApplicationId, StringComparison.Ordinal)
            && string.Equals(w.Selector.ExecutablePath, selector.ExecutablePath, StringComparison.OrdinalIgnoreCase)
            && string.Equals(w.Selector.WindowClass, selector.WindowClass, StringComparison.Ordinal)).ToArray();
        var exact = candidates.Where(w => string.Equals(w.Title, selector.TitleHint, StringComparison.Ordinal)).ToArray();
        return exact.Length == 1 ? exact[0] : exact.Length == 0 && candidates.Length == 1 ? candidates[0] : null;
    }

    public static WindowSelector? FromEntity(WorldEntity entity)
    {
        if (!entity.Parameters.TryGetValue("application", out var value) || value.ValueKind != JsonValueKind.Object) return null;
        try
        {
            var selector = value.Deserialize<WindowSelector>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
            return selector is null || string.IsNullOrWhiteSpace(selector.ApplicationId) || string.IsNullOrWhiteSpace(selector.WindowClass) ? null : selector;
        }
        catch (JsonException) { return null; }
    }
}

public sealed record DiscoveredWindow(string Id, string Title, string Application, WindowSelector Selector, bool IsMinimized, bool CanCapture, string? Restriction);
public sealed record WindowFrame(long Sequence, int Width, int Height, string MimeType, byte[] Data);
public sealed record SurfaceRead(string Status, WindowFrame? Frame = null);
public sealed record ControlLease(string Id, string SessionId, string EntityId, string WindowId, string Mode, DateTimeOffset ExpiresAt);
public sealed class PlatformOperationException(string code) : Exception(code) { public string Code { get; } = code; }

public interface IApplicationPlatform : IAsyncDisposable
{
    string Status { get; }
    Task<IReadOnlyList<DiscoveredWindow>> DiscoverAsync(CancellationToken token);
    Task<string> StartCaptureAsync(string windowId, CancellationToken token);
    ValueTask<WindowFrame?> ReadFrameAsync(string streamId, long afterSequence, CancellationToken token);
    Task StopCaptureAsync(string streamId, CancellationToken token);
    Task InputAsync(string windowId, SurfaceInput input, string mode, CancellationToken token);
    Task FocusAsync(string windowId, CancellationToken token);
    Task ReleaseInputAsync(CancellationToken token);
}

public sealed class UnavailableApplicationPlatform : IApplicationPlatform
{
    public string Status => "platform_unavailable";
    public Task<IReadOnlyList<DiscoveredWindow>> DiscoverAsync(CancellationToken token) => Task.FromResult<IReadOnlyList<DiscoveredWindow>>([]);
    public Task<string> StartCaptureAsync(string id, CancellationToken token) => throw new PlatformOperationException(Status);
    public ValueTask<WindowFrame?> ReadFrameAsync(string id, long after, CancellationToken token) => ValueTask.FromResult<WindowFrame?>(null);
    public Task StopCaptureAsync(string id, CancellationToken token) => Task.CompletedTask;
    public Task InputAsync(string id, SurfaceInput input, string mode, CancellationToken token) => throw new PlatformOperationException(Status);
    public Task FocusAsync(string id, CancellationToken token) => throw new PlatformOperationException(Status);
    public Task ReleaseInputAsync(CancellationToken token) => Task.CompletedTask;
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

public sealed record SurfaceInput(string Kind, string? Phase = null, double? X = null, double? Y = null, string? Button = null,
    double? DeltaX = null, double? DeltaY = null, string? Key = null, string? Text = null)
{
    public static void Validate(SurfaceInput input)
    {
        bool Coordinate(double? n) => n is >= 0 and <= 1 && double.IsFinite(n.Value);
        if (input.Kind == "pointer")
        {
            if (!Coordinate(input.X) || !Coordinate(input.Y) || input.Phase is not ("move" or "down" or "up")
                || (input.Phase != "move" && input.Button is not ("primary" or "secondary"))) throw new PlatformOperationException("invalid_pointer");
        }
        else if (input.Kind == "wheel")
        {
            if (!Coordinate(input.X) || !Coordinate(input.Y) || input.DeltaX is null || input.DeltaY is null
                || !double.IsFinite(input.DeltaX.Value) || !double.IsFinite(input.DeltaY.Value)
                || Math.Abs(input.DeltaX.Value) > 10_000 || Math.Abs(input.DeltaY.Value) > 10_000) throw new PlatformOperationException("invalid_wheel");
        }
        else if (input.Kind == "key")
        {
            if (input.Phase is not ("down" or "up") || string.IsNullOrEmpty(input.Key) || input.Key.Length > 64 || input.Key is "Meta" or "OS")
                throw new PlatformOperationException("invalid_key");
        }
        else if (input.Kind == "text")
        {
            if (string.IsNullOrEmpty(input.Text) || input.Text.Length > 4096 || input.Text.Contains('\0')) throw new PlatformOperationException("invalid_text");
        }
        else throw new PlatformOperationException("invalid_input_kind");
    }
}
