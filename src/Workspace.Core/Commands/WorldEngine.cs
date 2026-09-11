using System.Text.Json;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;

namespace Workspace.Core.Commands;

public sealed class WorldEngine
{
    private readonly IWorldStore _store;
    private readonly List<HistoryEntry> _undo = new();
    private readonly List<HistoryEntry> _redo = new();
    private WorldState _current;

    public WorldEngine(WorldState initial, IWorldStore store)
    {
        _current = initial;
        _store = store;
    }

    public WorldState Current => _current;

    public async ValueTask<CommandResult> ExecuteAsync(
        WorldCommand command,
        CommandContext context,
        CancellationToken cancellationToken)
    {
        if (command is HistoryUndoCommand)
            return await UndoAsync(context, cancellationToken);
        if (command is HistoryRedoCommand)
            return await RedoAsync(context, cancellationToken);

        var built = command switch
        {
            EntityCreateCommand c => BuildCreate(c),
            EntityRemoveCommand c => BuildRemove(c),
            EntityRenameCommand c => BuildRename(c),
            EntityReparentCommand c => BuildReparent(c),
            TransformSetCommand c => BuildTransform(c),
            ParametersPatchCommand c => BuildParameters(c),
            RelationshipAddCommand c => BuildRelationshipAdd(c),
            RelationshipRemoveCommand c => BuildRelationshipRemove(c),
            _ => Built.Reject("unsupported_command"),
        };

        if (built.ErrorCode is not null)
            return CommandResult.Reject(_current, built.ErrorCode);

        var next = new WorldState(built.Entities!, _current.WorldRevision + 1);
        var history = built.Patches is { Count: > 0 }
            ? new HistoryEntry($"op:{Guid.NewGuid():N}", command.RequestId, built.Patches)
            : null;

        await _store.PersistAcceptedAsync(next, history, cancellationToken);
        _current = next;
        if (history is not null)
        {
            _undo.Add(history);
            _redo.Clear();
        }

        return CommandResult.Accept(_current, history?.OperationId);
    }

    private Built BuildTransform(TransformSetCommand command)
    {
        if (!TryEntity(command.EntityId, command.Expected, out var entity, out var error)) return Built.Reject(error!);
        var after = entity! with
        {
            Transform = command.Transform,
            Revisions = entity.Revisions.Increment(RevisionPlane.Transform),
        };
        return Replace(entity, after, RevisionPlane.Transform);
    }

    private Built BuildParameters(ParametersPatchCommand command)
    {
        if (!TryEntity(command.EntityId, command.Expected, out var entity, out var error)) return Built.Reject(error!);
        var parameters = entity!.Parameters.ToDictionary(k => k.Key, v => v.Value.Clone(), StringComparer.Ordinal);
        foreach (var (key, value) in command.Patch) parameters[key] = value.Clone();
        var after = entity with
        {
            Parameters = parameters,
            Revisions = entity.Revisions.Increment(RevisionPlane.Parameters),
        };
        return Replace(entity, after, RevisionPlane.Parameters);
    }

    private Built BuildRename(EntityRenameCommand command)
    {
        if (!TryEntity(command.EntityId, command.Expected, out var entity, out var error)) return Built.Reject(error!);
        var after = entity! with
        {
            Name = command.Name,
            Revisions = entity.Revisions.Increment(RevisionPlane.Parameters),
        };
        return Replace(entity, after, RevisionPlane.Parameters);
    }

    private Built BuildReparent(EntityReparentCommand command)
    {
        if (!TryEntity(command.EntityId, command.Expected, out var entity, out var error)) return Built.Reject(error!);
        if (command.ParentId is not null && !_current.Entities.ContainsKey(command.ParentId)) return Built.Reject("parent_not_found");
        if (WouldCreateCycle(command.EntityId, command.ParentId)) return Built.Reject("cyclic_parent");
        var after = entity! with
        {
            ParentId = command.ParentId,
            Revisions = entity.Revisions.Increment(RevisionPlane.Relationships),
        };
        return Replace(entity, after, RevisionPlane.Relationships);
    }

    private Built BuildCreate(EntityCreateCommand command)
    {
        if (_current.Entities.ContainsKey(command.Entity.Id)) return Built.Reject("entity_exists");
        if (command.Entity.ParentId is not null && !_current.Entities.ContainsKey(command.Entity.ParentId)) return Built.Reject("parent_not_found");
        var map = CopyEntities();
        map[command.Entity.Id] = command.Entity;
        return new Built(map, new[] { new HistoryPatch(command.Entity.Id, null, command.Entity, Array.Empty<RevisionPlane>()) }, null);
    }

    private Built BuildRemove(EntityRemoveCommand command)
    {
        if (!TryEntity(command.EntityId, command.Expected, out var entity, out var error)) return Built.Reject(error!);
        var map = CopyEntities();
        map.Remove(command.EntityId);
        var patches = new List<HistoryPatch>
        {
            new(command.EntityId, entity, null, Array.Empty<RevisionPlane>()),
        };

        foreach (var (id, source) in _current.Entities)
        {
            if (id == command.EntityId) continue;
            var changed = false;
            var relationships = source.Relationships.Select(r =>
            {
                if (r.TargetId != command.EntityId) return r;
                changed = true;
                return r.MissingTargetPolicy == MissingTargetPolicy.RemoveRelationship
                    ? null
                    : r with { TargetMissing = true };
            }).Where(r => r is not null).Cast<WorldRelationship>().ToArray();
            if (!changed) continue;
            var after = source with
            {
                Relationships = relationships,
                Revisions = source.Revisions.Increment(RevisionPlane.Relationships),
            };
            map[id] = after;
            patches.Add(new HistoryPatch(id, source, after, new[] { RevisionPlane.Relationships }));
        }

        return new Built(map, patches, null);
    }

    private Built BuildRelationshipAdd(RelationshipAddCommand command)
    {
        if (!TryEntity(command.EntityId, command.Expected, out var entity, out var error)) return Built.Reject(error!);
        var relationships = entity!.Relationships.Concat(new[] { command.Relationship }).ToArray();
        var after = entity with { Relationships = relationships, Revisions = entity.Revisions.Increment(RevisionPlane.Relationships) };
        return Replace(entity, after, RevisionPlane.Relationships);
    }

    private Built BuildRelationshipRemove(RelationshipRemoveCommand command)
    {
        if (!TryEntity(command.EntityId, command.Expected, out var entity, out var error)) return Built.Reject(error!);
        var relationships = entity!.Relationships.Where(r => r.Type != command.Type || r.TargetId != command.TargetId).ToArray();
        var after = entity with { Relationships = relationships, Revisions = entity.Revisions.Increment(RevisionPlane.Relationships) };
        return Replace(entity, after, RevisionPlane.Relationships);
    }

    private Built Replace(WorldEntity before, WorldEntity after, params RevisionPlane[] planes)
    {
        var map = CopyEntities();
        map[before.Id] = after;
        return new Built(map, new[] { new HistoryPatch(before.Id, before, after, planes) }, null);
    }

    private bool TryEntity(
        string id,
        IReadOnlyDictionary<RevisionPlane, long> expected,
        out WorldEntity? entity,
        out string? error)
    {
        if (!_current.Entities.TryGetValue(id, out entity))
        {
            error = "entity_not_found";
            return false;
        }

        foreach (var (plane, revision) in expected)
        {
            if (entity.Revisions.Get(plane) != revision)
            {
                error = "revision_conflict";
                return false;
            }
        }

        error = null;
        return true;
    }

    private async ValueTask<CommandResult> UndoAsync(CommandContext context, CancellationToken cancellationToken)
    {
        if (!context.Trusted) return CommandResult.Reject(_current, "forbidden_trusted_command");
        if (_undo.Count == 0) return CommandResult.Reject(_current, "nothing_to_undo");
        var entry = _undo[^1];
        var next = ApplyHistory(entry, useBefore: true);
        await _store.PersistAcceptedAsync(next, null, cancellationToken);
        _current = next;
        _undo.RemoveAt(_undo.Count - 1);
        _redo.Add(entry);
        return CommandResult.Accept(_current, entry.OperationId);
    }

    private async ValueTask<CommandResult> RedoAsync(CommandContext context, CancellationToken cancellationToken)
    {
        if (!context.Trusted) return CommandResult.Reject(_current, "forbidden_trusted_command");
        if (_redo.Count == 0) return CommandResult.Reject(_current, "nothing_to_redo");
        var entry = _redo[^1];
        var next = ApplyHistory(entry, useBefore: false);
        await _store.PersistAcceptedAsync(next, null, cancellationToken);
        _current = next;
        _redo.RemoveAt(_redo.Count - 1);
        _undo.Add(entry);
        return CommandResult.Accept(_current, entry.OperationId);
    }

    private WorldState ApplyHistory(HistoryEntry entry, bool useBefore)
    {
        var map = CopyEntities();
        foreach (var patch in entry.Patches)
        {
            var desired = useBefore ? patch.Before : patch.After;
            var opposite = useBefore ? patch.After : patch.Before;
            if (desired is null)
            {
                map.Remove(patch.EntityId);
                continue;
            }
            if (opposite is null || !map.TryGetValue(patch.EntityId, out var current))
            {
                map[patch.EntityId] = desired;
                continue;
            }

            var planes = patch.AffectedPlanes.ToHashSet();
            var next = current;
            if (planes.Contains(RevisionPlane.Transform)) next = next with { Transform = desired.Transform };
            if (planes.Contains(RevisionPlane.Parameters)) next = next with { Name = desired.Name, Parameters = CloneParameters(desired.Parameters) };
            if (planes.Contains(RevisionPlane.Relationships)) next = next with { ParentId = desired.ParentId, Relationships = desired.Relationships.ToArray() };
            if (planes.Contains(RevisionPlane.Implementation)) next = next with { PackageBinding = desired.PackageBinding };
            next = next with { Revisions = current.Revisions.Increment(planes.ToArray()) };
            map[patch.EntityId] = next;
        }
        return new WorldState(map, _current.WorldRevision + 1);
    }

    private bool WouldCreateCycle(string entityId, string? parentId)
    {
        var cursor = parentId;
        while (cursor is not null)
        {
            if (cursor == entityId) return true;
            cursor = _current.Entities.TryGetValue(cursor, out var parent) ? parent.ParentId : null;
        }
        return false;
    }

    private Dictionary<string, WorldEntity> CopyEntities() =>
        _current.Entities.ToDictionary(k => k.Key, v => v.Value, StringComparer.Ordinal);

    private static IReadOnlyDictionary<string, JsonElement> CloneParameters(IReadOnlyDictionary<string, JsonElement> source) =>
        source.ToDictionary(k => k.Key, v => v.Value.Clone(), StringComparer.Ordinal);

    private sealed record Built(
        IReadOnlyDictionary<string, WorldEntity>? Entities,
        IReadOnlyList<HistoryPatch>? Patches,
        string? ErrorCode)
    {
        public static Built Reject(string error) => new(null, null, error);
    }
}
