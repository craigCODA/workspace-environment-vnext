using Workspace.Core.History;
using Workspace.Core.World;

namespace Workspace.Core.Ports;

public interface IWorldStore
{
    Task<WorldState> LoadAsync(CancellationToken cancellationToken);
    Task PersistAcceptedAsync(WorldState state, HistoryEntry? history, CancellationToken cancellationToken);
    Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken);
}
