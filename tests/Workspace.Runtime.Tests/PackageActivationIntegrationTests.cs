using Workspace.Core.Commands;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;
using Workspace.Runtime.Packages;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class PackageActivationIntegrationTests
{
    [Fact]
    public async Task Prepared_candidate_carries_authoritative_entity_identity()
    {
        var entity = WorldEntity.Create("entity:x", "X");
        var state = new WorldState(new Dictionary<string, WorldEntity> { [entity.Id] = entity }, 0);
        var runtime = new CapturingRuntime();
        var coordinator = new PackageCoordinator(new WorldEngine(state, new MemoryStore(state)), runtime);

        var result = await coordinator.PublishAsync(
            new PackagePublishRequest("entity:x", "pkg:x", "export function start() {}", ValidManifest(), 0),
            new CommandContext("user", "user", true, "session", null, null),
            default);

        Assert.True(result.Published);
        Assert.NotNull(runtime.Candidate);
        Assert.Equal("entity:x", runtime.Candidate!.EntityId);
    }

    private static string ValidManifest() => "{\"packageId\":\"pkg:x\",\"name\":\"X\",\"stateSchemaVersion\":1,\"entry\":\"index.js\",\"requestedCapabilities\":[],\"assets\":[]}";

    private sealed class CapturingRuntime : IRuntimeGateway
    {
        public PackageCandidate? Candidate { get; private set; }
        public Task<RuntimePrepareResult> PrepareAsync(PackageCandidate candidate, CancellationToken cancellationToken)
        {
            Candidate = candidate;
            return Task.FromResult(new RuntimePrepareResult(true, null));
        }
        public Task ActivateAsync(string entityId, string revisionDigest, string generationToken, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task RetireAsync(string generationToken, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class MemoryStore(WorldState initial) : IWorldStore
    {
        private WorldState _state = initial;
        public Task<WorldState> LoadAsync(CancellationToken cancellationToken) => Task.FromResult(_state);
        public Task PersistAcceptedAsync(WorldState state, HistoryEntry? history, CancellationToken cancellationToken) { _state = state; return Task.CompletedTask; }
        public Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken) { _state = state; return Task.CompletedTask; }
    }
}
