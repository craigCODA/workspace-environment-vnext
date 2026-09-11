using Workspace.Runtime.Drafts;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class DraftWorkspaceTests
{
    [Fact]
    public async Task Draft_rejects_parent_escape_and_rooted_path()
    {
        var root = Path.Combine(Path.GetTempPath(), $"workspace-draft-{Guid.NewGuid():N}");
        var draft = await DraftWorkspace.CreateAsync(root, "draft:one", default);
        await Assert.ThrowsAsync<DraftPathViolationException>(() => draft.WriteTextAsync("../outside.txt", "no", default));
        await Assert.ThrowsAsync<DraftPathViolationException>(() => draft.WriteTextAsync(Path.GetFullPath(Path.Combine(root, "outside.txt")), "no", default));
    }

    [Fact]
    public async Task Draft_roundtrips_allowed_relative_file()
    {
        var root = Path.Combine(Path.GetTempPath(), $"workspace-draft-{Guid.NewGuid():N}");
        var draft = await DraftWorkspace.CreateAsync(root, "draft:one", default);
        await draft.WriteTextAsync("index.js", "export default 1;", default);
        Assert.Equal("export default 1;", await draft.ReadTextAsync("index.js", default));
    }
}
