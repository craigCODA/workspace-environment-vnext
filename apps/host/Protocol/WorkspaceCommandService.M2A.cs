using System.Text.Json;
using System.Text.RegularExpressions;
using Workspace.Core.Commands;
using Workspace.Core.World;
using Workspace.Host.M2A;
using Workspace.Runtime.Applications;

namespace Workspace.Host.Protocol;

public sealed partial class WorkspaceCommandService
{
    public ApplicationSurfaceService? Applications { get; init; }
    public WorldState Current => _engine.Current;

    private async ValueTask<HostCommandDispatchResult> DispatchM2AAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (!context.Trusted) return HostCommandDispatchResult.Reject("forbidden_trusted_command");
        try
        {
            return message.Command switch
            {
                "entity.create" => await CreateM2AEntityAsync(message, context, token),
                "parameters.patch" => await PatchM2AParametersAsync(message, context, token),
                "transform.set" => await SetM2ATransformAsync(message, context, token),
                "entity.rename" => await RenameM2AEntityAsync(message, context, token),
                "entity.remove" => await RemoveM2AEntityAsync(message, context, token),
                "instance.duplicate" => await DuplicateM2AEntityAsync(message, context, token),
                "application.search" => Applications is null
                    ? HostCommandDispatchResult.Accept(JsonSerializer.SerializeToElement(new { windows = Array.Empty<DiscoveredWindow>(), status = "platform_unavailable" }, JsonOptions))
                    : HostCommandDispatchResult.Accept(JsonSerializer.SerializeToElement(new { windows = await Applications.DiscoverAsync(token), status = Applications.Status }, JsonOptions)),
                "surface.bindWindow" => await BindM2AWindowAsync(message, context, token),
                "window.focus" => await FocusM2AWindowAsync(message, token),
                _ => HostCommandDispatchResult.Reject("command_not_wired"),
            };
        }
        catch (PlatformOperationException error) { return HostCommandDispatchResult.Reject(error.Code); }
        catch (JsonException) { return HostCommandDispatchResult.Reject("invalid_payload"); }
        catch (InvalidOperationException) { return HostCommandDispatchResult.Reject("invalid_payload"); }
        catch (ArgumentException) { return HostCommandDispatchResult.Reject("invalid_payload"); }
    }

    private async ValueTask<HostCommandDispatchResult> CreateM2AEntityAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (_engine.Current.Entities.Count >= 64) return HostCommandDispatchResult.Reject("world_entity_limit");
        if (!TryString(message.Payload, "templateId", out var templateId) || templateId is not ("m2a.brick" or "m2a.surface"))
            return HostCommandDispatchResult.Reject("unknown_template");
        var name = TryString(message.Payload, "name", out var requestedName) ? requestedName! : templateId == "m2a.brick" ? "Brick" : "Application screen";
        if (name.Length > 120) return HostCommandDispatchResult.Reject("name_too_long");
        var position = templateId == "m2a.brick" ? new Vec3(0, 0.85, -1.2) : new Vec3(0, 1.8, -2.8);
        if (message.Payload.TryGetProperty("position", out _))
        {
            if (!TryArray(message.Payload, "position", 3, out var xyz)) return HostCommandDispatchResult.Reject("invalid_position");
            position = new Vec3(xyz![0], xyz[1], xyz[2]);
        }
        if (Math.Abs(position.X) > 1_000 || Math.Abs(position.Y) > 1_000 || Math.Abs(position.Z) > 1_000)
            return HostCommandDispatchResult.Reject("position_out_of_range");
        var template = _engine.Current.Entities.Values.FirstOrDefault(e => M2AWorld.Kind(e) == "brick")?.PackageBinding;
        var entity = M2AWorld.CreateEntity(templateId, name, position, template);
        return FromCommandResult(await _engine.ExecuteAsync(new EntityCreateCommand(message.RequestId, entity, EmptyExpected), context, token));
    }

    private async ValueTask<HostCommandDispatchResult> PatchM2AParametersAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (!TryString(message.Payload, "entityId", out var id) || !TryInt64(message.Payload, "expectedParametersRevision", out var revision)
            || !message.Payload.TryGetProperty("patch", out var patch) || patch.ValueKind != JsonValueKind.Object)
            return HostCommandDispatchResult.Reject("invalid_payload");
        var values = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var property in patch.EnumerateObject())
        {
            if (property.Name is not ("color" or "dimensions")) return HostCommandDispatchResult.Reject("reserved_parameter");
            if (property.Name == "color" && (property.Value.ValueKind != JsonValueKind.String || !Regex.IsMatch(property.Value.GetString()!, "^#[0-9a-fA-F]{6}$")))
                return HostCommandDispatchResult.Reject("invalid_color");
            if (property.Name == "dimensions" && (!TryArray(patch, "dimensions", 3, out var dimensions) || dimensions!.Any(x => x < 0.02 || x > 30)))
                return HostCommandDispatchResult.Reject("invalid_dimensions");
            values.Add(property.Name, property.Value.Clone());
        }
        if (values.Count == 0) return HostCommandDispatchResult.Reject("empty_patch");
        return FromCommandResult(await _engine.ExecuteAsync(new ParametersPatchCommand(message.RequestId, id!, values, Expected(RevisionPlane.Parameters, revision)), context, token));
    }

    private async ValueTask<HostCommandDispatchResult> SetM2ATransformAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (!TryString(message.Payload, "entityId", out var id) || !TryInt64(message.Payload, "expectedTransformRevision", out var revision) || !TryTransform(message.Payload, out var transform))
            return HostCommandDispatchResult.Reject("invalid_payload");
        return FromCommandResult(await _engine.ExecuteAsync(new TransformSetCommand(message.RequestId, id!, transform!, Expected(RevisionPlane.Transform, revision)), context, token));
    }

    private async ValueTask<HostCommandDispatchResult> RenameM2AEntityAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (!TryString(message.Payload, "entityId", out var id) || !TryString(message.Payload, "name", out var name) || name!.Length > 120 || !TryInt64(message.Payload, "expectedParametersRevision", out var revision))
            return HostCommandDispatchResult.Reject("invalid_payload");
        return FromCommandResult(await _engine.ExecuteAsync(new EntityRenameCommand(message.RequestId, id!, name!, Expected(RevisionPlane.Parameters, revision)), context, token));
    }

    private async ValueTask<HostCommandDispatchResult> RemoveM2AEntityAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (!TryString(message.Payload, "entityId", out var id) || !TryInt64(message.Payload, "expectedTransformRevision", out var revision))
            return HostCommandDispatchResult.Reject("invalid_payload");
        if (_engine.Current.Entities.TryGetValue(id!, out var entity) && M2AWorld.Kind(entity) == "room") return HostCommandDispatchResult.Reject("room_is_protected");
        var result = await _engine.ExecuteAsync(new EntityRemoveCommand(message.RequestId, id!, Expected(RevisionPlane.Transform, revision)), context, token);
        if (result.Accepted && Applications is not null) await Applications.ReleaseSurfaceAsync(id!, token);
        return FromCommandResult(result);
    }

    private async ValueTask<HostCommandDispatchResult> DuplicateM2AEntityAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (_engine.Current.Entities.Count >= 64) return HostCommandDispatchResult.Reject("world_entity_limit");
        if (!TryString(message.Payload, "entityId", out var id) || !TryInt64(message.Payload, "expectedTransformRevision", out var revision))
            return HostCommandDispatchResult.Reject("invalid_payload");
        if (_engine.Current.Entities.TryGetValue(id!, out var entity) && M2AWorld.Kind(entity) == "room") return HostCommandDispatchResult.Reject("room_is_protected");
        return FromCommandResult(await _engine.ExecuteAsync(new InstanceDuplicateCommand(message.RequestId, id!, $"entity:{Guid.NewGuid():N}", Expected(RevisionPlane.Transform, revision)), context, token));
    }

    private async ValueTask<HostCommandDispatchResult> BindM2AWindowAsync(HostCommandMessage message, CommandContext context, CancellationToken token)
    {
        if (Applications is null) return HostCommandDispatchResult.Reject("platform_unavailable");
        if (!TryString(message.Payload, "entityId", out var id) || !TryString(message.Payload, "windowId", out var windowId) || !TryInt64(message.Payload, "expectedParametersRevision", out var revision))
            return HostCommandDispatchResult.Reject("invalid_payload");
        if (!_engine.Current.Entities.TryGetValue(id!, out var entity) || M2AWorld.Kind(entity) != "surface") return HostCommandDispatchResult.Reject("surface_not_found");
        var selected = await Applications.SelectWindowAsync(windowId!, token);
        var patch = new Dictionary<string, JsonElement> { ["application"] = JsonSerializer.SerializeToElement(selected.Selector, JsonOptions) };
        var result = await _engine.ExecuteAsync(new ParametersPatchCommand(message.RequestId, id!, patch, Expected(RevisionPlane.Parameters, revision)), context, token);
        if (result.Accepted) await Applications.BindSelectedAsync(id!, selected, token);
        return FromCommandResult(result);
    }

    private async ValueTask<HostCommandDispatchResult> FocusM2AWindowAsync(HostCommandMessage message, CancellationToken token)
    {
        if (Applications is null) return HostCommandDispatchResult.Reject("platform_unavailable");
        if (!TryString(message.Payload, "entityId", out var id) || !_engine.Current.Entities.TryGetValue(id!, out var entity)) return HostCommandDispatchResult.Reject("surface_not_found");
        await Applications.FocusAsync(entity, token);
        return HostCommandDispatchResult.Accept(WorldPayload(_engine.Current));
    }

    private static readonly IReadOnlyDictionary<RevisionPlane, long> EmptyExpected = new Dictionary<RevisionPlane, long>();
    private static IReadOnlyDictionary<RevisionPlane, long> Expected(RevisionPlane plane, long value) => new Dictionary<RevisionPlane, long> { [plane] = value };
}
