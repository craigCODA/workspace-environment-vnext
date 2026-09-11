using Workspace.Runtime.Packages;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class PackagePolicyTests
{
    [Theory]
    [InlineData("filesystem.read")]
    [InlineData("network.fetch")]
    [InlineData("process.exec")]
    [InlineData("native.bridge")]
    public void M1_rejects_ungivable_capabilities(string capability)
    {
        var manifest = $"{{\"packageId\":\"pkg:x\",\"name\":\"X\",\"stateSchemaVersion\":1,\"entry\":\"index.js\",\"requestedCapabilities\":[\"{capability}\"],\"assets\":[]}}";
        var result = PackageManifestPolicy.Validate(manifest);
        Assert.False(result.AllowedToActivate);
        Assert.Equal("capability_not_available_in_m1", result.ErrorCode);
    }

    [Fact]
    public void Manifest_rejects_lifecycle_scripts_and_plugins()
    {
        const string manifest = "{\"packageId\":\"pkg:x\",\"scripts\":{\"postinstall\":\"pwsh evil.ps1\"}}";
        Assert.Equal("forbidden_manifest_field", PackageManifestPolicy.Validate(manifest).ErrorCode);
    }
}
