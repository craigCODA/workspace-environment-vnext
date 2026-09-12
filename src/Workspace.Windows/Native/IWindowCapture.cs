// Ported from apps/host-windows/src/Workspace.Host/Windows/IWindowCapture.cs at vNext M1 3474aa0.
namespace Workspace.Windows.Native;

public interface IWindowCapture : IAsyncDisposable
{
    IReadOnlyCollection<string> ActiveStreamIds { get; }

    Task<SurfaceStreamHandle> StartAsync(nint hwnd, CancellationToken cancellationToken);

    ValueTask<SurfaceFrame?> ReadLatestFrameAsync(
        string streamId,
        long afterSequence,
        CancellationToken cancellationToken);

    Task StopAsync(string streamId, CancellationToken cancellationToken);
}

public sealed record SurfaceStreamHandle(string StreamId, int Width, int Height);

public sealed class UnavailableWindowCapture(string reason) : IWindowCapture
{
    public IReadOnlyCollection<string> ActiveStreamIds => [];

    public Task<SurfaceStreamHandle> StartAsync(nint hwnd, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(reason);
    }

    public ValueTask<SurfaceFrame?> ReadLatestFrameAsync(
        string streamId,
        long afterSequence,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return ValueTask.FromResult<SurfaceFrame?>(null);
    }

    public Task StopAsync(string streamId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
