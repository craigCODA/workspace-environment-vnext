using System.Text.Json;
using Workspace.Core.Commands;

namespace Workspace.Host.Protocol;

public sealed record HostCommandMessage(string RequestId, string Command, JsonElement Payload);
public sealed record HostCommandDispatchResult(bool Accepted, string? ErrorCode, JsonElement? Payload = null, string? RequestId = null)
{
    public static HostCommandDispatchResult Accept(JsonElement? payload = null) => new(true, null, payload);
    public static HostCommandDispatchResult Reject(string errorCode, JsonElement? payload = null) => new(false, errorCode, payload);
}

public sealed class WorkspaceSocketEndpoint
{
    private static readonly HashSet<string> AllowedTopLevel = new(StringComparer.Ordinal)
    {
        "type", "protocolVersion", "requestId", "command", "payload"
    };

    private static readonly HashSet<string> CommandNames = new(StringComparer.Ordinal)
    {
        "world.read", "entity.inspect", "package.inspect", "capability.inspect",
        "entity.create", "entity.remove", "entity.rename", "entity.reparent", "transform.set", "parameters.patch",
        "relationships.add", "relationships.remove", "reference.grant", "reference.revoke", "constraint.add", "constraint.remove",
        "edit.begin", "edit.update", "edit.commit", "edit.cancel", "history.undo", "history.redo", "workspace.save",
        "instance.duplicate", "parameters.copy", "package.fork", "package.publish", "package.activate", "package.disable",
        "package.rollback", "package.delete", "package.state.patch", "workspace.import", "workspace.export",
        "application.search", "application.open", "window.focus", "surface.bindWindow", "application.profile.save",
        "application.profile.delete", "application.close", "application.restart"
    };

    private readonly Func<AuthenticatedSession, string?> _generationResolver;
    private readonly Func<HostCommandMessage, CommandContext, CancellationToken, ValueTask<HostCommandDispatchResult>> _dispatch;

    public WorkspaceSocketEndpoint(
        Func<AuthenticatedSession, string?> generationResolver,
        Func<HostCommandMessage, CommandContext, CancellationToken, ValueTask<HostCommandDispatchResult>> dispatch)
    {
        _generationResolver = generationResolver;
        _dispatch = dispatch;
    }

    public async ValueTask<HostCommandDispatchResult> DispatchJsonAsync(
        string json,
        AuthenticatedSession session,
        CancellationToken cancellationToken)
    {
        JsonDocument document;
        try { document = JsonDocument.Parse(json); }
        catch (JsonException) { return HostCommandDispatchResult.Reject("invalid_envelope"); }
        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return HostCommandDispatchResult.Reject("invalid_envelope");
            foreach (var property in root.EnumerateObject())
                if (!AllowedTopLevel.Contains(property.Name)) return HostCommandDispatchResult.Reject("invalid_envelope");

            if (!root.TryGetProperty("type", out var type) || type.GetString() != "command.request") return HostCommandDispatchResult.Reject("invalid_envelope");
            if (!root.TryGetProperty("protocolVersion", out var version) || version.ValueKind != JsonValueKind.Number || version.GetDouble() != 1) return HostCommandDispatchResult.Reject("invalid_envelope");
            if (!root.TryGetProperty("requestId", out var requestId) || requestId.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(requestId.GetString())) return HostCommandDispatchResult.Reject("invalid_envelope");
            if (!root.TryGetProperty("command", out var command) || command.ValueKind != JsonValueKind.String) return HostCommandDispatchResult.Reject("invalid_envelope");
            var commandName = command.GetString()!;
            if (!CommandNames.Contains(commandName)) return HostCommandDispatchResult.Reject("unknown_command");
            if (!root.TryGetProperty("payload", out var payload) || payload.ValueKind != JsonValueKind.Object) return HostCommandDispatchResult.Reject("invalid_envelope");

            var message = new HostCommandMessage(requestId.GetString()!, commandName, payload.Clone());
            var context = new CommandContext(
                session.ActorId,
                session.ActorKind,
                session.Trusted,
                session.SessionId,
                session.ActorKind == "package" ? session.ActorId : null,
                _generationResolver(session));
            var result = await _dispatch(message, context, cancellationToken);
            return result with { RequestId = message.RequestId };
        }
    }
}
