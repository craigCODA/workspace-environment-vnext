using Workspace.Core.World;

namespace Workspace.Storage.Tests;

internal static class StorageTestWorld
{
    public static WorldState StateWithBoxAt(double x, double y, double z, string? packageRevision = null)
    {
        var entity = WorldEntity.Create("entity:box", "Box") with
        {
            Transform = new TransformState(new Vec3(x, y, z), Quaternion.Identity, Vec3.One),
            PackageBinding = packageRevision is null ? null : new PackageBinding("pkg:test", packageRevision, "generation:test"),
        };
        return new WorldState(new Dictionary<string, WorldEntity> { [entity.Id] = entity }, 1);
    }
}
