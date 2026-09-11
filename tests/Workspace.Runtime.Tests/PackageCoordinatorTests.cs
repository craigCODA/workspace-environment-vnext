using Workspace.Core.Commands;
using Workspace.Core.Ports;
using Workspace.Core.World;
using Workspace.Runtime.Packages;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class PackageCoordinatorTests
{
    [Fact]
    public async Task Prepare_failure_leaves_previous_revision_active()
    {
        var old = new PackageBinding("pkg:x", "old", "generation:old");
        var entity = WorldEntity.Create("entity:x", "X") with { PackageBinding = old };
        var state = new WorldState(new Dictionary<string, WorldEntity> { [entity.Id] = entity }, 0);
        var store = new MemoryStore(state);
        var engine = new WorldEngine(state, store);
        var runtime = new FakeRuntime { Prepare = new RuntimePrepareResult(false, "compile_failed") };
        var coordinator = new PackageCoordinator(engine, runtime);

        var result = await coordinator.PublishAsync(
            new PackagePublishRequest("entity:x", "pkg:x", "export default 2;", ValidManifest(), 0),
            new CommandContext("user", "user", true, "s", null, null), default);

        Assert.False(result.Published);
        Assert.Equal("compile_failed", result.ErrorCode);
        Assert.Equal("old", engine.Current.Entities["entity:x"].PackageBinding!.RevisionDigest);
        Assert.False(runtime.Activated);
    }

    private static string ValidManifest() => "{\"packageId\":\"pkg:x\",\"name\":\"X\",\"stateSchemaVersion\":1,\"entry\":\"index.js\",\"requestedCapabilities\":[],\"assets\":[]}";

    private sealed class FakeRuntime : IRuntimeGateway
    {
        public RuntimePrepareResult Prepare { get; set; } = new(true, null);
        public bool Activated { get; private set; }
        public Task<RuntimePrepareResult> PrepareAsync(PackageCandidate candidate, CancellationToken cancellationToken) => Task.FromResult(Prepare);
        public Task ActivateAsync(string entityId, string revisionDigest, string generationToken, CancellationToken cancellationToken) { Activated = true; return Task.CompletedTask; }
        public Task RetireAsync(string generationToken, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class MemoryStore(WorldState initial) : IWorldStore
    {
        private WorldState _state = initial;
        public Task<WorldState> LoadAsync(CancellationToken cancellationToken) => Task.FromResult(_state);
        public Task PersistAcceptedAsync(WorldState state, Workspace.Core.History.HistoryEntry? history, CancellationToken cancellationToken) { _state = state; return Task.CompletedTask; }
        public Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken) { _state = state; return Task.CompletedTask; }
    }
}
