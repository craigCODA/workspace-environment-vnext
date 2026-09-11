using Workspace.Storage.Sqlite;
using Xunit;

namespace Workspace.Storage.Tests;

public sealed class SqliteWorldStoreTests
{
    [Fact]
    public async Task Accepted_transform_survives_store_reopen()
    {
        var path = TempDb();
        await using (var store = await SqliteWorldStore.OpenAsync(path))
        {
            await store.PersistAcceptedAsync(StorageTestWorld.StateWithBoxAt(3, 4, 5), null, default);
        }

        await using var reopened = await SqliteWorldStore.OpenAsync(path);
        var loaded = await reopened.LoadAsync(default);
        Assert.Equal(3, loaded.Entities["entity:box"].Transform.Position.X);
    }

    [Fact]
    public async Task Explicit_checkpoint_contains_only_current_accepted_state()
    {
        var path = TempDb();
        await using var store = await SqliteWorldStore.OpenAsync(path);
        var accepted = StorageTestWorld.StateWithBoxAt(3, 0, 0);
        await store.PersistAcceptedAsync(accepted, null, default);
        await store.SaveCheckpointAsync(accepted, default);

        var checkpoint = await store.LoadLatestCheckpointAsync(default);
        Assert.NotNull(checkpoint);
        Assert.Equal(3, checkpoint!.Entities["entity:box"].Transform.Position.X);
    }

    private static string TempDb() => Path.Combine(Path.GetTempPath(), $"workspace-vnext-{Guid.NewGuid():N}.db");
}
