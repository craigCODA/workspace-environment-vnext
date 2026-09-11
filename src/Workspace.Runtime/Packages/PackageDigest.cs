using System.Security.Cryptography;
using System.Text;

namespace Workspace.Runtime.Packages;

public static class PackageDigest
{
    public static string Compute(string manifestJson, string source, IEnumerable<string>? assetDigests = null)
    {
        var manifestDigest = Sha(manifestJson);
        var sourceDigest = Sha(source.Replace("\r\n", "\n", StringComparison.Ordinal));
        var assets = (assetDigests ?? Array.Empty<string>()).OrderBy(x => x, StringComparer.Ordinal);
        return Sha(string.Join("\n", new[] { manifestDigest, sourceDigest }.Concat(assets)));
    }

    private static string Sha(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
