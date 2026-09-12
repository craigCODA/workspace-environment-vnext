// Ported from apps/host-windows/src/Workspace.Host/Windows/SurfaceFrame.cs at vNext M1 3474aa0.
namespace Workspace.Windows.Native;

public sealed record SurfaceFrame(
    string StreamId,
    long Sequence,
    int Width,
    int Height,
    string MimeType,
    byte[] Data);
