namespace Workspace.Core.World;

public readonly record struct EntityId(string Value)
{
    public static EntityId New() => new($"entity:{Guid.NewGuid():N}");
    public override string ToString() => Value;
}
