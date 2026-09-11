using Workspace.Core.World;

namespace Workspace.Core.Commands;

public sealed record CommandResult(
    bool Accepted,
    string? ErrorCode,
    WorldState State,
    string? OperationId)
{
    public static CommandResult Accept(WorldState state, string? operationId = null) => new(true, null, state, operationId);
    public static CommandResult Reject(WorldState state, string errorCode) => new(false, errorCode, state, null);
}
