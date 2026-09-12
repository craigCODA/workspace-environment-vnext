using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;
using Workspace.Host.Protocol;
using Xunit;

namespace Workspace.Host.Tests;

public sealed class WorkspaceCommandServiceTests
{
    [Fact]
    public async Task Trusted_package_disable_updates_authoritative_world()
    {
        var entity = WorldEntity.Create("entity:box", "Box") with
        {
            PackageBinding = new PackageBinding("pkg:m1-breadth", "revision", "generation:m1-breadth", true),
        };
        var initial = new WorldState(new Dictionary<string, WorldEntity> { [entity.Id] = entity }, 0);
        var store = new MemoryStore(initial);
        var service = new WorkspaceCommandService(new WorldEngine(initial, store), store);
        var payload = JsonSerializer.SerializeToElement(new
        {
            entityId = "entity:box",
            expectedImplementationRevision = 0,
        });

        var result = await service.DispatchAsync(
            new HostCommandMessage("disable", "package.disable", payload),
            new CommandContext("user:test", "user", true, "session:test", null, null),
            CancellationToken.None);

        Assert.True(result.Accepted);
        var world = Assert.IsType<JsonElement>(result.Payload);
        Assert.False(world.GetProperty("entities").GetProperty("entity:box").GetProperty("packageBinding").GetProperty("active").GetBoolean());
        Assert.Equal(1, world.GetProperty("entities").GetProperty("entity:box").GetProperty("revisions").GetProperty("implementation").GetInt64());
    }

    private sealed class MemoryStore(WorldState initial) : IWorldStore
    {
        public WorldState State { get; private set; } = initial;
        public Task<WorldState> LoadAsync(CancellationToken cancellationToken) => Task.FromResult(State);
        public Task PersistAcceptedAsync(WorldState state, HistoryEntry? history, CancellationToken cancellationToken)
        {
            State = state;
            return Task.CompletedTask;
        }
        public Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken)
        {
            State = state;
            return Task.CompletedTask;
        }
    }
}
