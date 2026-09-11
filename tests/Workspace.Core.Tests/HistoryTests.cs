using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.World;
using Xunit;

namespace Workspace.Core.Tests;

public sealed class HistoryTests
{
    [Fact]
    public async Task Guest_cannot_invoke_trusted_undo()
    {
        var engine = TestWorld.CreateWithBox("entity:box");
        var result = await engine.ExecuteAsync(new HistoryUndoCommand("undo-guest"), TestActor.Guest, default);
        Assert.False(result.Accepted);
        Assert.Equal("forbidden_trusted_command", result.ErrorCode);
    }

    [Fact]
    public async Task Undoing_parameter_patch_does_not_rewind_transform()
    {
        var engine = TestWorld.CreateWithBox("entity:box");
        await engine.ExecuteAsync(
            new ParametersPatchCommand(
                "color",
                "entity:box",
                new Dictionary<string, JsonElement> { ["color"] = JsonSerializer.SerializeToElement("red") },
                new Dictionary<RevisionPlane, long> { [RevisionPlane.Parameters] = 0 }),
            TestActor.User,
            default);
        await engine.ExecuteAsync(
            new TransformSetCommand(
                "move",
                "entity:box",
                TestPose.At(7, 0, 0),
                new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = 0 }),
            TestActor.User,
            default);

        var undo = await engine.ExecuteAsync(new HistoryUndoCommand("undo"), TestActor.User, default);
        Assert.True(undo.Accepted);
        Assert.Equal(0, engine.Current.Entities["entity:box"].Transform.Position.X);

        var undoAgain = await engine.ExecuteAsync(new HistoryUndoCommand("undo2"), TestActor.User, default);
        Assert.True(undoAgain.Accepted);
        Assert.False(engine.Current.Entities["entity:box"].Parameters.ContainsKey("color"));
    }

    [Fact]
    public async Task Divergent_mutation_clears_redo_branch()
    {
        var engine = TestWorld.CreateWithBox("entity:box");
        await engine.ExecuteAsync(
            new TransformSetCommand("move", "entity:box", TestPose.At(3, 0, 0), new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = 0 }),
            TestActor.User,
            default);
        Assert.True((await engine.ExecuteAsync(new HistoryUndoCommand("undo"), TestActor.User, default)).Accepted);
        await engine.ExecuteAsync(
            new TransformSetCommand("move2", "entity:box", TestPose.At(8, 0, 0), new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = engine.Current.Entities["entity:box"].Revisions.Transform }),
            TestActor.User,
            default);

        var redo = await engine.ExecuteAsync(new HistoryRedoCommand("redo"), TestActor.User, default);
        Assert.False(redo.Accepted);
        Assert.Equal("nothing_to_redo", redo.ErrorCode);
    }
}
