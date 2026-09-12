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
    public async Task Disconnect_cleanup_removes_only_that_sessions_edit_leases()
    {
        var store = new MemoryWorldStore(WorldWithBox());
        var service = new WorkspaceCommandService(new WorldEngine(store.State, store), store);
        var first = Context("session:one");
        var second = Context("session:two");

        Assert.True((await service.DispatchAsync(Begin("begin:one"), first, default)).Accepted);
        Assert.True((await service.DispatchAsync(Begin("begin:two"), second, default)).Accepted);
        Assert.Equal(2, service.ActiveLeaseCount);

        service.CancelSession("session:one");

        Assert.Equal(1, service.ActiveLeaseCount);
        service.CancelSession("session:two");
        Assert.Equal(0, service.ActiveLeaseCount);
    }

    [Fact]
    public async Task World_read_reports_active_lease_count_for_read_only_diagnostics()
    {
        var store = new MemoryWorldStore(WorldWithBox());
        var service = new WorkspaceCommandService(new WorldEngine(store.State, store), store);
        var context = Context("session:one");

        Assert.True((await service.DispatchAsync(Begin("begin:one"), context, default)).Accepted);
        var before = await service.DispatchAsync(Read("read:before"), context, default);
        Assert.Equal(1, before.Payload!.Value.GetProperty("activeLeaseCount").GetInt32());

        service.CancelSession("session:one");
        var after = await service.DispatchAsync(Read("read:after"), context, default);
        Assert.Equal(0, after.Payload!.Value.GetProperty("activeLeaseCount").GetInt32());
    }

    private static HostCommandMessage Begin(string requestId) => new(
        requestId,
        "edit.begin",
        JsonSerializer.SerializeToElement(new
        {
            entityId = "entity:box",
            fields = new[] { "transform" },
            expectedTransformRevision = 0,
        }));

    private static HostCommandMessage Read(string requestId) => new(
        requestId,
        "world.read",
        JsonSerializer.SerializeToElement(new { }));

    private static CommandContext Context(string sessionId) => new(
        "user:test",
        "user",
        true,
        sessionId,
        null,
        null);

    private static WorldState WorldWithBox()
    {
        var box = WorldEntity.Create("entity:box", "Box");
        return new WorldState(new Dictionary<string, WorldEntity>(StringComparer.Ordinal)
        {
            [box.Id] = box,
        }, 0);
    }

    private sealed class MemoryWorldStore : IWorldStore
    {
        public MemoryWorldStore(WorldState state) => State = state;
        public WorldState State { get; private set; }

        public Task<WorldState> LoadAsync(CancellationToken cancellationToken) => Task.FromResult(State);

        public Task PersistAcceptedAsync(WorldState state, HistoryEntry? history, CancellationToken cancellationToken)
        {
            State = state;
            return Task.CompletedTask;
        }

        public Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
