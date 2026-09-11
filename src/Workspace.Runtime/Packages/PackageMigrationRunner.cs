using System.Text.Json;

namespace Workspace.Runtime.Packages;

public sealed record PackageMigrationResult(bool Succeeded, JsonElement? Output, string? ErrorCode);

public static class PackageMigrationRunner
{
    public static PackageMigrationResult Run(
        JsonElement input,
        Func<JsonElement, JsonElement> migration,
        Func<JsonElement, bool> validate)
    {
        try
        {
            var output = migration(input.Clone()).Clone();
            return validate(output)
                ? new PackageMigrationResult(true, output, null)
                : new PackageMigrationResult(false, null, "migration_failed");
        }
        catch
        {
            return new PackageMigrationResult(false, null, "migration_failed");
        }
    }
}
