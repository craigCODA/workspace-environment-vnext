using Workspace.Core.Ports;
using Workspace.Storage.Sqlite;
using Xunit;

namespace Workspace.Storage.Tests;

public sealed class SqlitePackageRevisionStoreTests
{
    [Fact]
    public async Task Staged_package_revision_can_be_loaded_by_digest()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"workspace-package-store-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        try
        {
            var store = new SqlitePackageRevisionStore(Path.Combine(directory, "workspace.db"));
            var artifact = new PackageRevisionArtifact(
                "pkg:m1-breadth",
                "sha256:revision",
                "{\"packageId\":\"pkg:m1-breadth\"}",
                "export const value = 1;");
            await store.StagePackageRevisionAsync(artifact, CancellationToken.None);

            var loaded = await store.LoadPackageRevisionAsync("sha256:revision", CancellationToken.None);

            Assert.Equal(artifact, loaded);
            Assert.Null(await store.LoadPackageRevisionAsync("sha256:missing", CancellationToken.None));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
