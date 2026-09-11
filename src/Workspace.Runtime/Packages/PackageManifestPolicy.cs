using System.Text.Json;

namespace Workspace.Runtime.Packages;

public sealed record PackageManifestPolicyResult(bool AllowedToActivate, string? ErrorCode);

public static class PackageManifestPolicy
{
    private static readonly HashSet<string> Ungivable = new(StringComparer.Ordinal)
    {
        "filesystem.read",
        "network.fetch",
        "process.exec",
        "native.bridge",
    };

    public static PackageManifestPolicyResult Validate(string manifestJson)
    {
        try
        {
            using var document = JsonDocument.Parse(manifestJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return Deny("invalid_manifest");
            if (root.TryGetProperty("scripts", out _) || root.TryGetProperty("plugins", out _) || root.TryGetProperty("buildPlugins", out _))
                return Deny("forbidden_manifest_field");
            if (root.TryGetProperty("requestedCapabilities", out var requested) && requested.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in requested.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String && Ungivable.Contains(item.GetString()!))
                        return Deny("capability_not_available_in_m1");
                }
            }
            if (!root.TryGetProperty("packageId", out var packageId) || string.IsNullOrWhiteSpace(packageId.GetString())) return Deny("invalid_manifest");
            if (!root.TryGetProperty("entry", out var entry) || string.IsNullOrWhiteSpace(entry.GetString())) return Deny("invalid_manifest");
            return new PackageManifestPolicyResult(true, null);
        }
        catch (JsonException)
        {
            return Deny("invalid_manifest");
        }
    }

    private static PackageManifestPolicyResult Deny(string error) => new(false, error);
}
