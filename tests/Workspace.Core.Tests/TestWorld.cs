using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;

namespace Workspace.Core.Tests;

internal static class TestActor
{
    public static readonly CommandContext User = new("user", "user", true, "session-user", null, null);
    public static readonly CommandContext TrustedCoda = new("coda", "coda", true, "session-coda", null, null);
    public static readonly CommandContext Guest = new("guest", "package", false, "session-guest", "entity:guest", "generation:guest");
}

internal static class TestPose
{
    public static TransformState At(double x, double y, double z) => new(
        new Vec3(x, y, z),
        Quaternion.Identity,
        new Vec3(1, 1, 1));
}

internal static class TestWorld
{
    public static WorldEngine CreateWithBox(string id, long transformRevision = 0, long parameterRevision = 0)
    {
        var box = WorldEntity.Create(id, "Box") with
        {
            Revisions = new RevisionVector(transformRevision, parameterRevision, 0, 0, 0),
        };
        return Create(box);
    }

    public static WorldEngine CreateParentWithChild(string parentId, string childId, TransformState childLocal)
    {
        var parent = WorldEntity.Create(parentId, "Parent");
        var child = WorldEntity.Create(childId, "Child") with { ParentId = parentId, Transform = childLocal };
        return Create(parent, child);
    }

    public static WorldEngine CreateRelatedPair(string sourceId, string targetId, bool includeLookalike = false)
    {
        var relation = new WorldRelationship("controls", targetId, MissingTargetPolicy.MarkMissing, null, false);
        var source = WorldEntity.Create(sourceId, "Switch") with { Relationships = new[] { relation } };
        var target = WorldEntity.Create(targetId, "Wall");
        if (!includeLookalike) return Create(source, target);
        var lookalike = WorldEntity.Create("entity:wall-lookalike", "Wall");
        return Create(source, target, lookalike);
    }

    private static WorldEngine Create(params WorldEntity[] entities)
    {
        var state = new WorldState(entities.ToDictionary(x => x.Id, x => x), 0);
        return new WorldEngine(state, new InMemoryWorldStore(state));
    }
}

internal sealed class InMemoryWorldStore : IWorldStore
{
    private WorldState _state;
    public InMemoryWorldStore(WorldState state) => _state = state;
    public Task<WorldState> LoadAsync(CancellationToken cancellationToken) => Task.FromResult(_state);
    public Task PersistAcceptedAsync(WorldState state, HistoryEntry? history, CancellationToken cancellationToken)
    {
        _state = state;
        return Task.CompletedTask;
    }
    public Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken)
    {
        _state = state;
        return Task.CompletedTask;
    }
}
