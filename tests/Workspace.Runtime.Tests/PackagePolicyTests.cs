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
    public void A34_ungivable_capability_request_blocks_candidate_activation(string capability)
    {
        var manifest = $"{{\"packageId\":\"pkg:x\",\"name\":\"X\",\"stateSchemaVersion\":1,\"entry\":\"index.js\",\"requestedCapabilities\":[\"{capability}\"],\"assets\":[]}}";
        var result = PackageManifestPolicy.Validate(manifest);
        Assert.False(result.AllowedToActivate);
        Assert.Equal("capability_not_available_in_m1", result.ErrorCode);
    }

    [Theory]
    [InlineData("{\"packageId\":\"pkg:x\",\"entry\":\"index.js\",\"scripts\":{\"postinstall\":\"pwsh evil.ps1\"}}")]
    [InlineData("{\"packageId\":\"pkg:x\",\"entry\":\"index.js\",\"plugins\":[\"evil\"]}")]
    [InlineData("{\"packageId\":\"pkg:x\",\"entry\":\"index.js\",\"buildPlugins\":[\"evil\"]}")]
    public void A32_lifecycle_and_unapproved_plugin_fields_are_rejected(string manifest)
    {
        var result = PackageManifestPolicy.Validate(manifest);
        Assert.False(result.AllowedToActivate);
        Assert.Equal("forbidden_manifest_field", result.ErrorCode);
    }
}
