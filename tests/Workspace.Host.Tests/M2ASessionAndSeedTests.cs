using System.Text.Json;
using Workspace.Core.World;
using Workspace.Host.M2A;
using Workspace.Host.Protocol;
using Workspace.Storage.Sqlite;
using Xunit;

namespace Workspace.Host.Tests;

public sealed class M2ASessionAndSeedTests
{
    [Fact]
    public void Desktop_session_is_reconnectable_without_changing_single_use_tokens()
    {
        var sessions = new SessionAuthenticator();
        var single = sessions.Issue();
        Assert.True(sessions.TryConsume(single, out _));
        Assert.False(sessions.TryConsume(single, out _));
        var desktop = sessions.IssueDesktopToken();
        Assert.True(sessions.TryConsume(desktop, out var a));
        Assert.True(sessions.TryConsume(desktop, out var b));
        Assert.Equal(a, b);
        Assert.True(sessions.TryAuthorize(desktop, out _));
        Assert.NotEqual(single, desktop);
    }

    [Fact]
    public void M2A_options_do_not_enable_acceptance_or_accept_external_session_tokens()
    {
        var options = HostRuntimeOptions.Parse(["--m2a", "--port", "45678"]);
        Assert.True(options.M2A);
        Assert.False(options.Acceptance);
        Assert.Throws<InvalidOperationException>(() => HostRuntimeOptions.Parse(["--m2a", "--session-token", "fixed"]));
    }

    [Fact]
    public async Task Seeded_world_survives_full_store_close_and_is_not_reset()
    {
        var root = Path.Combine(Path.GetTempPath(), "workspace-m2a-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "world.db");
        try
        {
            string serialized;
            await using (var store = await SqliteWorldStore.OpenAsync(path))
            {
                var seeded = await M2AWorld.SeedAsync(await store.LoadAsync(default), store, new SqlitePackageRevisionStore(path), default);
                Assert.Equal(3, seeded.Entities.Count);
                Assert.Single(seeded.Entities.Values, e => e.PackageBinding?.PackageId == "pkg:m2a-brick");
                serialized = JsonSerializer.Serialize(seeded);
            }
            await using (var reopened = await SqliteWorldStore.OpenAsync(path))
            {
                var loaded = await M2AWorld.SeedAsync(await reopened.LoadAsync(default), reopened, new SqlitePackageRevisionStore(path), default);
                Assert.Equal(serialized, JsonSerializer.Serialize(loaded));
                Assert.DoesNotContain("hwnd", serialized, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("sessionToken", serialized, StringComparison.OrdinalIgnoreCase);
            }
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
