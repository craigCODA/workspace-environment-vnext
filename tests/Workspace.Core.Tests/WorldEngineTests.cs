using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.World;
using Xunit;

namespace Workspace.Core.Tests;

public sealed class WorldEngineTests
{
    [Fact]
    public async Task Parameter_change_does_not_conflict_with_independent_transform_change()
    {
        var engine = TestWorld.CreateWithBox("entity:box", transformRevision: 4, parameterRevision: 7);
        var move = new TransformSetCommand(
            "m1",
            "entity:box",
            TestPose.At(2, 0, 0),
            new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = 4 });
        var color = new ParametersPatchCommand(
            "p1",
            "entity:box",
            new Dictionary<string, JsonElement> { ["color"] = Json("red") },
            new Dictionary<RevisionPlane, long> { [RevisionPlane.Parameters] = 7 });

        Assert.True((await engine.ExecuteAsync(move, TestActor.User, default)).Accepted);
        Assert.True((await engine.ExecuteAsync(color, TestActor.User, default)).Accepted);
    }

    [Fact]
    public async Task Stale_transform_cannot_overwrite_newer_user_move()
    {
        var engine = TestWorld.CreateWithBox("entity:box", transformRevision: 4);
        Assert.True((await engine.ExecuteAsync(
            new TransformSetCommand(
                "user",
                "entity:box",
                TestPose.At(9, 0, 0),
                new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = 4 }),
            TestActor.User,
            default)).Accepted);

        var stale = await engine.ExecuteAsync(
            new TransformSetCommand(
                "agent",
                "entity:box",
                TestPose.At(1, 0, 0),
                new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = 4 }),
            TestActor.TrustedCoda,
            default);

        Assert.False(stale.Accepted);
        Assert.Equal("revision_conflict", stale.ErrorCode);
        Assert.Equal(9, engine.Current.Entities["entity:box"].Transform.Position.X);
    }

    private static JsonElement Json(string value) => JsonSerializer.SerializeToElement(value);
}
