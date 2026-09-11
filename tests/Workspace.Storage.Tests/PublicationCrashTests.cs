using Workspace.Storage.Sqlite;
using Xunit;

namespace Workspace.Storage.Tests;

public sealed class PublicationCrashTests
{
    [Theory]
    [InlineData(StorageFaultPoint.AfterBlobInsert)]
    [InlineData(StorageFaultPoint.BeforeStateCommit)]
    public async Task Interrupted_publication_never_exposes_half_active_revision(StorageFaultPoint point)
    {
        var path = Path.Combine(Path.GetTempPath(), $"workspace-vnext-{Guid.NewGuid():N}.db");
        const string oldDigest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        const string newDigest = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

        await using (var initial = await SqliteWorldStore.OpenAsync(path))
        {
            await initial.PutPackageBlobAsync(oldDigest, "text/javascript", "export default 1;"u8.ToArray(), default);
            await initial.PersistAcceptedAsync(StorageTestWorld.StateWithBoxAt(0, 0, 0, oldDigest), null, default);
        }

        await Assert.ThrowsAsync<InjectedStorageFaultException>(async () =>
        {
            await using var failing = await SqliteWorldStore.OpenAsync(path, new ThrowAt(point));
            await failing.PublishPackageRevisionAsync(
                StorageTestWorld.StateWithBoxAt(0, 0, 0, newDigest),
                newDigest,
                "pkg:test",
                "{}",
                "text/javascript",
                "export default 2;"u8.ToArray(),
                default);
        });

        await using var reopened = await SqliteWorldStore.OpenAsync(path);
        var loaded = await reopened.LoadAsync(default);
        Assert.Equal(oldDigest, loaded.Entities["entity:box"].PackageBinding!.RevisionDigest);
        Assert.False(await reopened.ActiveReferencesMissingBlobAsync(default));
    }

    private sealed class ThrowAt(StorageFaultPoint target) : IStorageFaultInjector
    {
        public void Hit(StorageFaultPoint point)
        {
            if (point == target) throw new InjectedStorageFaultException(point);
        }
    }
}
