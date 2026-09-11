using Workspace.Core.Commands;
using Workspace.Core.World;

namespace Workspace.Core.History;

public sealed record HistoryPatch(
    string EntityId,
    WorldEntity? Before,
    WorldEntity? After,
    IReadOnlyCollection<RevisionPlane> AffectedPlanes);
