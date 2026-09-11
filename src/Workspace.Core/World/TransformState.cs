namespace Workspace.Core.World;

public sealed record TransformState(Vec3 Position, Quaternion Rotation, Vec3 Scale)
{
    public static readonly TransformState Identity = new(Vec3.Zero, Quaternion.Identity, Vec3.One);
}
