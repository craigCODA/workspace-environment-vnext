using Workspace.Core.Commands;
using Workspace.Core.World;
using Xunit;

namespace Workspace.Core.Tests;

public sealed class HierarchyTests
{
    [Fact]
    public async Task Parent_move_preserves_child_local_transform()
    {
        var engine = TestWorld.CreateParentWithChild(
            parentId: "entity:parent",
            childId: "entity:child",
            childLocal: TestPose.At(1, 2, 3));
        var before = engine.Current.Entities["entity:child"].Transform;

        var result = await engine.ExecuteAsync(
            new TransformSetCommand(
                "parent-move",
                "entity:parent",
                TestPose.At(9, 0, 0),
                new Dictionary<RevisionPlane, long> { [RevisionPlane.Transform] = 0 }),
            TestActor.User,
            default);

        Assert.True(result.Accepted);
        Assert.Equal(before, engine.Current.Entities["entity:child"].Transform);
    }

    [Fact]
    public async Task Rename_preserves_relationship_target_identity()
    {
        var engine = TestWorld.CreateRelatedPair("entity:switch", "entity:wall");
        var result = await engine.ExecuteAsync(
            new EntityRenameCommand("rename", "entity:wall", "Renamed Wall", new Dictionary<RevisionPlane, long>()),
            TestActor.User,
            default);
        Assert.True(result.Accepted);
        Assert.Equal("entity:wall", engine.Current.Entities["entity:switch"].Relationships.Single().TargetId);
    }

    [Fact]
    public async Task Delete_marks_missing_reference_without_name_retargeting()
    {
        var engine = TestWorld.CreateRelatedPair("entity:switch", "entity:wall", includeLookalike: true);
        var result = await engine.ExecuteAsync(
            new EntityRemoveCommand("delete", "entity:wall", new Dictionary<RevisionPlane, long>()),
            TestActor.User,
            default);
        Assert.True(result.Accepted);
        var relation = engine.Current.Entities["entity:switch"].Relationships.Single();
        Assert.Equal("entity:wall", relation.TargetId);
        Assert.True(relation.TargetMissing);
    }
}
