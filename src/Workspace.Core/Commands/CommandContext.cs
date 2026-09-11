namespace Workspace.Core.Commands;

public sealed record CommandContext(
    string ActorId,
    string ActorKind,
    bool Trusted,
    string SessionId,
    string? PackageInstanceId,
    string? GenerationToken);
