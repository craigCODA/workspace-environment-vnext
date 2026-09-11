using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;
using Workspace.Runtime.Packages;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class PackageLifecycleTests
{
    [Fact]
    public async Task Duplicate_instance_gets_new_identity_but_same_package_revision()
    {
        var original = WorldEntity.Create("entity:original", "Original") with
        {
            Parameters = new Dictionary<string, JsonElement> { ["length"] = JsonSerializer.SerializeToElement(2) },
            PackageBinding = new PackageBinding("pkg:brick", "rev:a", "generation:a")
        };
        var engine = CreateEngine(original);

        var result = await engine.ExecuteAsync(
            new InstanceDuplicateCommand("dup", "entity:original", "entity:copy", new Dictionary<RevisionPlane, long>()),
            TrustedUser,
            default);

        Assert.True(result.Accepted);
        var copy = engine.Current.Entities["entity:copy"];
        Assert.NotEqual(original.Id, copy.Id);
        Assert.Equal("rev:a", copy.PackageBinding!.RevisionDigest);
        Assert.Equal(2, copy.Parameters["length"].GetInt32());
    }

    [Fact]
    public async Task Copy_parameters_keeps_target_identity_and_package_binding()
    {
        var source = WorldEntity.Create("entity:source", "Source") with
        {
            Parameters = new Dictionary<string, JsonElement> { ["length"] = JsonSerializer.SerializeToElement(5), ["color"] = JsonSerializer.SerializeToElement("red") },
            PackageBinding = new PackageBinding("pkg:x", "rev:1", "g:1")
        };
        var target = WorldEntity.Create("entity:target", "Target") with
        {
            Parameters = new Dictionary<string, JsonElement> { ["length"] = JsonSerializer.SerializeToElement(1) },
            PackageBinding = new PackageBinding("pkg:x", "rev:2", "g:2")
        };
        var engine = CreateEngine(source, target);

        var result = await engine.ExecuteAsync(
            new ParametersCopyCommand("copy", "entity:source", new[] { "entity:target" }, new[] { "length" }, new Dictionary<RevisionPlane, long>()),
            TrustedUser,
            default);

        Assert.True(result.Accepted);
        Assert.Equal("entity:target", engine.Current.Entities["entity:target"].Id);
        Assert.Equal("rev:2", engine.Current.Entities["entity:target"].PackageBinding!.RevisionDigest);
        Assert.Equal(5, engine.Current.Entities["entity:target"].Parameters["length"].GetInt32());
        Assert.False(engine.Current.Entities["entity:target"].Parameters.ContainsKey("color"));
    }

    [Fact]
    public async Task Disable_keeps_entity_identifiable_and_marks_implementation_inactive()
    {
        var entity = WorldEntity.Create("entity:x", "X") with { PackageBinding = new PackageBinding("pkg:x", "rev:1", "g:1") };
        var engine = CreateEngine(entity);

        var result = await engine.ExecuteAsync(
            new PackageDisableCommand("disable", "entity:x", new Dictionary<RevisionPlane, long> { [RevisionPlane.Implementation] = 0 }),
            TrustedUser,
            default);

        Assert.True(result.Accepted);
        Assert.True(engine.Current.Entities.ContainsKey("entity:x"));
        Assert.False(engine.Current.Entities["entity:x"].PackageBinding!.Active);
    }

    [Fact]
    public async Task Rollback_changes_only_implementation_binding_not_transform()
    {
        var entity = WorldEntity.Create("entity:x", "X") with
        {
            Transform = new TransformState(new Vec3(9, 0, 0), Quaternion.Identity, Vec3.One),
            PackageBinding = new PackageBinding("pkg:x", "rev:new", "g:new")
        };
        var engine = CreateEngine(entity);

        var result = await engine.ExecuteAsync(
            new PackageRollbackCommand("rollback", "entity:x", "rev:old", "g:old", new Dictionary<RevisionPlane, long> { [RevisionPlane.Implementation] = 0 }),
            TrustedUser,
            default);

        Assert.True(result.Accepted);
        Assert.Equal("rev:old", engine.Current.Entities["entity:x"].PackageBinding!.RevisionDigest);
        Assert.Equal(9, engine.Current.Entities["entity:x"].Transform.Position.X);
    }

    [Fact]
    public void Fork_creates_new_package_identity_with_lineage_without_rebinding_instances()
    {
        var result = PackageForker.Fork("pkg:brick", "pkg:brick-wide", "source");
        Assert.Equal("pkg:brick-wide", result.PackageId);
        Assert.Equal("pkg:brick", result.LineageParentPackageId);
        Assert.Equal("source", result.Source);
    }

    [Fact]
    public async Task Successful_publish_prepares_commits_activates_then_retires_old_generation()
    {
        var entity = WorldEntity.Create("entity:x", "X") with { PackageBinding = new PackageBinding("pkg:x", "rev:old", "g:old") };
        var state = new WorldState(new Dictionary<string, WorldEntity> { [entity.Id] = entity }, 0);
        var store = new MemoryStore(state);
        var engine = new WorldEngine(state, store);
        var runtime = new RecordingRuntime();
        var coordinator = new PackageCoordinator(engine, runtime);

        var result = await coordinator.PublishAsync(
            new PackagePublishRequest("entity:x", "pkg:x", "export default 2;", ValidManifest(), 0),
            TrustedUser,
            default);

        Assert.True(result.Published);
        Assert.Equal(result.RevisionDigest, engine.Current.Entities["entity:x"].PackageBinding!.RevisionDigest);
        Assert.Equal(new[] { "prepare", "activate", "retire:g:old" }, runtime.Events);
    }

    private static string ValidManifest() => "{\"packageId\":\"pkg:x\",\"name\":\"X\",\"stateSchemaVersion\":1,\"entry\":\"index.js\",\"requestedCapabilities\":[],\"assets\":[]}";
    private static readonly CommandContext TrustedUser = new("user", "user", true, "session", null, null);

    private static WorldEngine CreateEngine(params WorldEntity[] entities)
    {
        var state = new WorldState(entities.ToDictionary(x => x.Id, x => x), 0);
        return new WorldEngine(state, new MemoryStore(state));
    }

    private sealed class RecordingRuntime : IRuntimeGateway
    {
        public List<string> Events { get; } = new();
        public Task<RuntimePrepareResult> PrepareAsync(PackageCandidate candidate, CancellationToken cancellationToken) { Events.Add("prepare"); return Task.FromResult(new RuntimePrepareResult(true, null)); }
        public Task ActivateAsync(string entityId, string revisionDigest, string generationToken, CancellationToken cancellationToken) { Events.Add("activate"); return Task.CompletedTask; }
        public Task RetireAsync(string generationToken, CancellationToken cancellationToken) { Events.Add($"retire:{generationToken}"); return Task.CompletedTask; }
    }

    private sealed class MemoryStore(WorldState initial) : IWorldStore
    {
        private WorldState _state = initial;
        public Task<WorldState> LoadAsync(CancellationToken cancellationToken) => Task.FromResult(_state);
        public Task PersistAcceptedAsync(WorldState state, HistoryEntry? history, CancellationToken cancellationToken) { _state = state; return Task.CompletedTask; }
        public Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken) { _state = state; return Task.CompletedTask; }
    }
}
