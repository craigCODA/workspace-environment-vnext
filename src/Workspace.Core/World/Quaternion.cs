namespace Workspace.Core.World;

public sealed record Quaternion(double X, double Y, double Z, double W)
{
    public static readonly Quaternion Identity = new(0, 0, 0, 1);
}
