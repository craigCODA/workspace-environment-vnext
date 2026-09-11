namespace Workspace.Core.World;

public sealed record WorldState(IReadOnlyDictionary<string, WorldEntity> Entities, long WorldRevision)
{
    public static readonly WorldState Empty = new(
        new Dictionary<string, WorldEntity>(StringComparer.Ordinal),
        0);
}
