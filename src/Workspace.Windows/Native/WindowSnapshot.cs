// Ported from apps/host-windows/src/Workspace.Host/Windows/WindowSnapshot.cs at vNext M1 3474aa0.
namespace Workspace.Windows.Native;

public readonly record struct WindowBounds(int Left, int Top, int Width, int Height);

public sealed record WindowSnapshot(
    nint Hwnd,
    int ProcessId,
    string Title,
    WindowBounds Bounds,
    bool IsVisible,
    bool IsMinimized,
    string ApplicationId);
