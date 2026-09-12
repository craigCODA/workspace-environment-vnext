using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.Ports;
using Workspace.Core.World;

namespace Workspace.Host.Protocol;

public sealed class WorkspaceCommandService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly WorldEngine _engine;
    private readonly IWorldStore _store;
    private readonly SemaphoreSlim _serial = new(1, 1);
    private readonly object _leaseGate = new();
    private readonly Dictionary<string, EditLease> _leases = new(StringComparer.Ordinal);

    public WorkspaceCommandService(WorldEngine engine, IWorldStore store)
    {
        _engine = engine;
        _store = store;
    }

    public int ActiveLeaseCount
    {
        get
        {
            lock (_leaseGate) return _leases.Count;
        }
    }

    public void CancelSession(string sessionId)
    {
        lock (_leaseGate)
        {
            foreach (var leaseId in _leases
                .Where(pair => string.Equals(pair.Value.SessionId, sessionId, StringComparison.Ordinal))
                .Select(pair => pair.Key)
                .ToArray())
            {
                _leases.Remove(leaseId);
            }
        }
    }

    public async ValueTask<HostCommandDispatchResult> DispatchAsync(
        HostCommandMessage message,
        CommandContext context,
        CancellationToken cancellationToken)
    {
        await _serial.WaitAsync(cancellationToken);
        try
        {
            return message.Command switch
            {
                "world.read" => HostCommandDispatchResult.Accept(WorldPayload(_engine.Current)),
                "edit.begin" => BeginEdit(message, context),
                "edit.commit" => await CommitEditAsync(message, context, cancellationToken),
                "edit.cancel" => CancelEdit(message, context),
                "history.undo" => await RunHistoryAsync(new HistoryUndoCommand(message.RequestId), context, cancellationToken),
                "history.redo" => await RunHistoryAsync(new HistoryRedoCommand(message.RequestId), context, cancellationToken),
                "workspace.save" => await SaveAsync(context, cancellationToken),
                _ => HostCommandDispatchResult.Reject("command_not_wired"),
            };
        }
        finally
        {
            _serial.Release();
        }
    }

    private HostCommandDispatchResult BeginEdit(HostCommandMessage message, CommandContext context)
    {
        if (!context.Trusted) return HostCommandDispatchResult.Reject("forbidden_trusted_command");
        if (!TryString(message.Payload, "entityId", out var entityId)
            || !TryInt64(message.Payload, "expectedTransformRevision", out var expectedRevision))
            return HostCommandDispatchResult.Reject("invalid_payload");

        if (!_engine.Current.Entities.TryGetValue(entityId!, out var entity))
            return HostCommandDispatchResult.Reject("entity_not_found");
        if (entity.Revisions.Transform != expectedRevision)
            return HostCommandDispatchResult.Reject("revision_conflict");

        var leaseId = $"lease:{Guid.NewGuid():N}";
        lock (_leaseGate)
            _leases.Add(leaseId, new EditLease(leaseId, entityId!, expectedRevision, context.SessionId));

        return HostCommandDispatchResult.Accept(JsonSerializer.SerializeToElement(new { leaseId }, JsonOptions));
    }

    private async ValueTask<HostCommandDispatchResult> CommitEditAsync(
        HostCommandMessage message,
        CommandContext context,
        CancellationToken cancellationToken)
    {
        if (!TryString(message.Payload, "leaseId", out var leaseId)
            || !TryTransform(message.Payload, out var transform))
            return HostCommandDispatchResult.Reject("invalid_payload");

        EditLease? lease;
        lock (_leaseGate)
        {
            _leases.TryGetValue(leaseId!, out lease);
            if (lease is not null) _leases.Remove(leaseId!);
        }
        if (lease is null) return HostCommandDispatchResult.Reject("edit_lease_not_found");
        if (!string.Equals(lease.SessionId, context.SessionId, StringComparison.Ordinal))
            return HostCommandDispatchResult.Reject("edit_lease_session_mismatch");

        var command = new TransformSetCommand(
            message.RequestId,
            lease.EntityId,
            transform!,
            new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = lease.ExpectedTransformRevision });
        var result = await _engine.ExecuteAsync(command, context, cancellationToken);
        return FromCommandResult(result);
    }

    private HostCommandDispatchResult CancelEdit(HostCommandMessage message, CommandContext context)
    {
        if (!TryString(message.Payload, "leaseId", out var leaseId))
            return HostCommandDispatchResult.Reject("invalid_payload");

        lock (_leaseGate)
        {
            if (!_leases.TryGetValue(leaseId!, out var lease))
                return HostCommandDispatchResult.Accept();
            if (!string.Equals(lease.SessionId, context.SessionId, StringComparison.Ordinal))
                return HostCommandDispatchResult.Reject("edit_lease_session_mismatch");
            _leases.Remove(leaseId!);
        }
        return HostCommandDispatchResult.Accept();
    }

    private async ValueTask<HostCommandDispatchResult> RunHistoryAsync(
        WorldCommand command,
        CommandContext context,
        CancellationToken cancellationToken)
    {
        var result = await _engine.ExecuteAsync(command, context, cancellationToken);
        return FromCommandResult(result);
    }

    private async ValueTask<HostCommandDispatchResult> SaveAsync(CommandContext context, CancellationToken cancellationToken)
    {
        if (!context.Trusted) return HostCommandDispatchResult.Reject("forbidden_trusted_command");
        await _store.SaveCheckpointAsync(_engine.Current, cancellationToken);
        return HostCommandDispatchResult.Accept(WorldPayload(_engine.Current));
    }

    private HostCommandDispatchResult FromCommandResult(CommandResult result) => result.Accepted
        ? HostCommandDispatchResult.Accept(WorldPayload(result.State))
        : HostCommandDispatchResult.Reject(result.ErrorCode ?? "command_rejected", WorldPayload(result.State));

    private JsonElement WorldPayload(WorldState state)
    {
        var entities = state.Entities.ToDictionary(
            pair => pair.Key,
            pair => new
            {
                id = pair.Value.Id,
                name = pair.Value.Name,
                parentId = pair.Value.ParentId,
                transform = new
                {
                    position = new[] { pair.Value.Transform.Position.X, pair.Value.Transform.Position.Y, pair.Value.Transform.Position.Z },
                    rotation = new[] { pair.Value.Transform.Rotation.X, pair.Value.Transform.Rotation.Y, pair.Value.Transform.Rotation.Z, pair.Value.Transform.Rotation.W },
                    scale = new[] { pair.Value.Transform.Scale.X, pair.Value.Transform.Scale.Y, pair.Value.Transform.Scale.Z },
                },
                revisions = new
                {
                    transform = pair.Value.Revisions.Transform,
                    parameters = pair.Value.Revisions.Parameters,
                    relationships = pair.Value.Revisions.Relationships,
                    implementation = pair.Value.Revisions.Implementation,
                    packageState = pair.Value.Revisions.PackageState,
                },
            },
            StringComparer.Ordinal);

        return JsonSerializer.SerializeToElement(new
        {
            worldRevision = state.WorldRevision,
            activeLeaseCount = ActiveLeaseCount,
            entities,
        }, JsonOptions);
    }

    private static bool TryString(JsonElement payload, string name, out string? value)
    {
        value = null;
        if (!payload.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.String) return false;
        value = element.GetString();
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool TryInt64(JsonElement payload, string name, out long value)
    {
        value = 0;
        return payload.TryGetProperty(name, out var element)
            && element.ValueKind == JsonValueKind.Number
            && element.TryGetInt64(out value);
    }

    private static bool TryTransform(JsonElement payload, out TransformState? transform)
    {
        transform = null;
        if (!payload.TryGetProperty("transform", out var element) || element.ValueKind != JsonValueKind.Object) return false;
        if (!TryArray(element, "position", 3, out var position)
            || !TryArray(element, "rotation", 4, out var rotation)
            || !TryArray(element, "scale", 3, out var scale)) return false;
        transform = new TransformState(
            new Vec3(position![0], position[1], position[2]),
            new Quaternion(rotation![0], rotation[1], rotation[2], rotation[3]),
            new Vec3(scale![0], scale[1], scale[2]));
        return true;
    }

    private static bool TryArray(JsonElement owner, string name, int length, out double[]? values)
    {
        values = null;
        if (!owner.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.Array) return false;
        var items = element.EnumerateArray().ToArray();
        if (items.Length != length || items.Any(item => item.ValueKind != JsonValueKind.Number)) return false;
        values = items.Select(item => item.GetDouble()).ToArray();
        return values.All(double.IsFinite);
    }

    private sealed record EditLease(string LeaseId, string EntityId, long ExpectedTransformRevision, string SessionId);
}
