namespace Workspace.Core.History;

public sealed record HistoryEntry(
    string OperationId,
    string RequestId,
    IReadOnlyList<HistoryPatch> Patches);
