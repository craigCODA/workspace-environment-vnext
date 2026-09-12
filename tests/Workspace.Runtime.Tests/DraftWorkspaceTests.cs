using Workspace.Runtime.Drafts;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class DraftWorkspaceTests
{
    [Fact]
    public async Task A31_draft_rejects_parent_escape_and_rooted_path()
    {
        var root = Path.Combine(Path.GetTempPath(), $"workspace-draft-{Guid.NewGuid():N}");
        var draft = await DraftWorkspace.CreateAsync(root, "draft:one", default);
        await Assert.ThrowsAsync<DraftPathViolationException>(() => draft.WriteTextAsync("../outside.txt", "no", default));
        await Assert.ThrowsAsync<DraftPathViolationException>(() => draft.WriteTextAsync(Path.GetFullPath(Path.Combine(root, "outside.txt")), "no", default));
    }

    [Fact]
    public async Task A31_draft_cannot_write_product_or_auth_sentinel_paths()
    {
        var root = Path.Combine(Path.GetTempPath(), $"workspace-draft-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var productSentinel = Path.Combine(root, "product-sentinel.txt");
        var authDirectory = Path.Combine(root, "auth");
        var authSentinel = Path.Combine(authDirectory, "auth-sentinel.txt");
        Directory.CreateDirectory(authDirectory);
        await File.WriteAllTextAsync(productSentinel, "product-safe");
        await File.WriteAllTextAsync(authSentinel, "auth-safe");

        var draft = await DraftWorkspace.CreateAsync(root, "draft:one", default);
        var productEscape = Path.GetRelativePath(draft.Root, productSentinel);
        var authEscape = Path.GetRelativePath(draft.Root, authSentinel);

        await Assert.ThrowsAsync<DraftPathViolationException>(() => draft.WriteTextAsync(productEscape, "overwrite", default));
        await Assert.ThrowsAsync<DraftPathViolationException>(() => draft.WriteTextAsync(authEscape, "overwrite", default));
        Assert.Equal("product-safe", await File.ReadAllTextAsync(productSentinel));
        Assert.Equal("auth-safe", await File.ReadAllTextAsync(authSentinel));
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
