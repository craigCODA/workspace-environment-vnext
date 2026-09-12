using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;
using Workspace.Host.Protocol;
using Xunit;

namespace Workspace.Host.Tests;

public sealed class M2AWorldCommandTests
{
    private static readonly CommandContext User = new("user:test", "user", true, "session:test", null, null);
    private static readonly CommandContext Guest = new("pkg:test", "package", false, "session:guest", "pkg:test", "generation:test");

    [Fact]
    public async Task World_read_preserves_durable_parameters_for_product_renderer()
    {
        var (service, _, _) = Create();
        var read = await Send(service, "world.read", new { });
        var entity = read.Payload!.Value.GetProperty("entities").GetProperty("test");
        Assert.True(entity.TryGetProperty("parameters", out var parameters));
        Assert.Equal("#b56845", parameters.GetProperty("color").GetString());
    }

    [Fact]
    public async Task Parameter_edit_is_durable_and_undoable()
    {
        var (service, engine, store) = Create();
        var patch = await Send(service, "parameters.patch", new { entityId = "test", expectedParametersRevision = 0, patch = new { color = "#224466" } });
        Assert.True(patch.Accepted, patch.ErrorCode);
        Assert.Equal("#224466", store.State.Entities["test"].Parameters["color"].GetString());
        Assert.True((await Send(service, "history.undo", new { })).Accepted);
        Assert.Equal("#b56845", engine.Current.Entities["test"].Parameters["color"].GetString());
        Assert.True((await Send(service, "history.redo", new { })).Accepted);
        Assert.Equal("#224466", engine.Current.Entities["test"].Parameters["color"].GetString());
    }

    [Fact]
    public async Task Stale_parameter_edit_does_not_overwrite_latest_state()
    {
        var (service, _, _) = Create();
        Assert.True((await Send(service, "parameters.patch", new { entityId = "test", expectedParametersRevision = 0, patch = new { color = "#224466" } })).Accepted);
        var result = await Send(service, "parameters.patch", new { entityId = "test", expectedParametersRevision = 0, patch = new { color = "#ffffff" } });
        Assert.False(result.Accepted);
        Assert.Equal("revision_conflict", result.ErrorCode);
    }

    [Theory]
    [InlineData("parameters.patch")]
    [InlineData("entity.create")]
    [InlineData("entity.remove")]
    [InlineData("transform.set")]
    [InlineData("surface.bindWindow")]
    [InlineData("application.open")]
    public async Task Product_commands_do_not_grant_guest_native_or_world_authority(string name)
    {
        var (service, _, _) = Create();
        var result = await Send(service, name, new { }, Guest);
        Assert.False(result.Accepted);
        Assert.Equal("forbidden_trusted_command", result.ErrorCode);
    }

    [Fact]
    public async Task Generic_parameter_patch_cannot_forge_a_native_binding()
    {
        var (service, engine, _) = Create();
        var result = await Send(service, "parameters.patch", new { entityId = "test", expectedParametersRevision = 0, patch = new { application = new { executablePath = "C:/arbitrary.exe" } } });
        Assert.False(result.Accepted);
        Assert.Equal("reserved_parameter", result.ErrorCode);
        Assert.False(engine.Current.Entities["test"].Parameters.ContainsKey("application"));
    }

    [Fact]
    public async Task Foreign_commit_does_not_consume_the_owners_edit_lease()
    {
        var (service, _, _) = Create();
        var begin = await Send(service, "edit.begin", new { entityId = "test", fields = new[] { "transform" }, expectedTransformRevision = 0 });
        var leaseId = begin.Payload!.Value.GetProperty("leaseId").GetString();
        var payload = new { leaseId, transform = new { position = new[] { 1d, 2d, 3d }, rotation = new[] { 0d, 0d, 0d, 1d }, scale = new[] { 1d, 1d, 1d } } };
        var denied = await Send(service, "edit.commit", payload, User with { SessionId = "session:other" });
        Assert.Equal("edit_lease_session_mismatch", denied.ErrorCode);
        Assert.Equal(1, service.ActiveLeaseCount);
        Assert.True((await Send(service, "edit.commit", payload)).Accepted);
        Assert.Equal(0, service.ActiveLeaseCount);
    }

    [Fact]
    public async Task Create_screen_and_duplicate_have_distinct_stable_ids()
    {
        var (service, engine, _) = Create();
        var result = await Send(service, "entity.create", new { templateId = "m2a.surface", name = "My display", position = new[] { 1d, 2d, -3d } });
        Assert.True(result.Accepted, result.ErrorCode);
        var created = engine.Current.Entities.Values.Single(e => e.Name == "My display");
        Assert.Equal("surface", created.Parameters["kind"].GetString());
        var duplicate = await Send(service, "instance.duplicate", new { entityId = created.Id, expectedTransformRevision = 0 });
        Assert.True(duplicate.Accepted, duplicate.ErrorCode);
        Assert.Equal(3, engine.Current.Entities.Count);
        Assert.Equal(3, engine.Current.Entities.Keys.Distinct().Count());
    }

    private static (WorkspaceCommandService, WorldEngine, MemoryStore) Create()
    {
        var entity = WorldEntity.Create("test", "Brick") with
        {
            Parameters = new Dictionary<string, JsonElement> { ["kind"] = JsonSerializer.SerializeToElement("brick"), ["color"] = JsonSerializer.SerializeToElement("#b56845") },
        };
        var initial = new WorldState(new Dictionary<string, WorldEntity> { [entity.Id] = entity }, 0);
        var store = new MemoryStore(initial);
        var engine = new WorldEngine(initial, store);
        return (new WorkspaceCommandService(engine, store), engine, store);
    }

    private static ValueTask<HostCommandDispatchResult> Send(WorkspaceCommandService service, string name, object payload, CommandContext? context = null) =>
        service.DispatchAsync(new HostCommandMessage(Guid.NewGuid().ToString(), name, JsonSerializer.SerializeToElement(payload)), context ?? User, CancellationToken.None);

    private sealed class MemoryStore(WorldState initial) : IWorldStore
    {
        public WorldState State { get; private set; } = initial;
        public Task<WorldState> LoadAsync(CancellationToken token) => Task.FromResult(State);
        public Task PersistAcceptedAsync(WorldState state, HistoryEntry? history, CancellationToken token) { State = state; return Task.CompletedTask; }
        public Task SaveCheckpointAsync(WorldState state, CancellationToken token) { State = state; return Task.CompletedTask; }
    }
}
