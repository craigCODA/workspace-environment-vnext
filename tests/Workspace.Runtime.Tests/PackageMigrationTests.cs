using System.Text.Json;
using Workspace.Runtime.Packages;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class PackageMigrationTests
{
    [Fact]
    public void Pure_migration_returns_validated_json()
    {
        var input = JsonSerializer.SerializeToElement(new { value = 1 });
        var result = PackageMigrationRunner.Run(
            input,
            state => JsonSerializer.SerializeToElement(new { value = state.GetProperty("value").GetInt32() + 1 }),
            output => output.GetProperty("value").GetInt32() == 2);
        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Output!.Value.GetProperty("value").GetInt32());
    }

    [Fact]
    public void Invalid_migration_is_quarantined()
    {
        var result = PackageMigrationRunner.Run(
            JsonSerializer.SerializeToElement(new { value = 1 }),
            _ => JsonSerializer.SerializeToElement(new { broken = true }),
            _ => false);
        Assert.False(result.Succeeded);
        Assert.Equal("migration_failed", result.ErrorCode);
    }
}
