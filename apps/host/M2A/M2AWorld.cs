using System.Text.Json;
using Workspace.Core.Ports;
using Workspace.Core.World;
using Workspace.Runtime.Packages;

namespace Workspace.Host.M2A;

public static class M2AWorld
{
    public static string? Kind(WorldEntity entity) => entity.Parameters.TryGetValue("kind", out var kind) && kind.ValueKind == JsonValueKind.String ? kind.GetString() : null;

    public static WorldEntity CreateEntity(string templateId, string name, Vec3 position, PackageBinding? brickTemplate)
    {
        var brick = templateId == "m2a.brick";
        return WorldEntity.Create($"entity:{Guid.NewGuid():N}", name) with
        {
            Transform = new TransformState(position, Quaternion.Identity, Vec3.One),
            Parameters = new Dictionary<string, JsonElement>
            {
                ["kind"] = JsonSerializer.SerializeToElement(brick ? "brick" : "surface"),
                ["color"] = JsonSerializer.SerializeToElement(brick ? "#b56845" : "#202b39"),
                ["dimensions"] = JsonSerializer.SerializeToElement(brick ? new[] { 0.4, 0.2, 0.2 } : new[] { 2.8, 1.6, 0.06 }),
            },
            PackageBinding = brick && brickTemplate is not null ? brickTemplate with { GenerationToken = $"generation:{Guid.NewGuid():N}" } : null,
        };
    }

    public static async Task<PackageBinding> LoadBrickTemplateAsync(IPackageRevisionStore revisions, CancellationToken token)
    {
        var directory = FindFixtureDirectory();
        var manifest = await File.ReadAllTextAsync(Path.Combine(directory, "manifest.json"), token);
        var source = (await File.ReadAllTextAsync(Path.Combine(directory, "index.js"), token)).Replace("\r\n", "\n", StringComparison.Ordinal);
        var digest = PackageDigest.Compute(manifest, source);
        await revisions.StagePackageRevisionAsync(new PackageRevisionArtifact("pkg:m2a-brick", digest, manifest, source), token);
        return new PackageBinding("pkg:m2a-brick", digest, $"generation:{Guid.NewGuid():N}", true);
    }

    public static async Task<WorldState> SeedAsync(WorldState initial, IWorldStore store, IPackageRevisionStore revisions, CancellationToken token, PackageBinding? template = null)
    {
        if (initial.Entities.Count != 0) return initial;
        var binding = template ?? await LoadBrickTemplateAsync(revisions, token);
        var brick = CreateEntity("m2a.brick", "Brick", new Vec3(0, 0.88, -1.2), binding);
        var surface = CreateEntity("m2a.surface", "Application screen", new Vec3(0, 1.9, -2.7), null);
        var room = WorldEntity.Create($"entity:{Guid.NewGuid():N}", "Workspace room") with
        {
            Parameters = new Dictionary<string, JsonElement> { ["kind"] = JsonSerializer.SerializeToElement("room"), ["dimensions"] = JsonSerializer.SerializeToElement(new[] { 16d, 4d, 12d }) },
        };
        var seeded = new WorldState(new[] { room, brick, surface }.ToDictionary(e => e.Id, StringComparer.Ordinal), 0);
        await store.PersistAcceptedAsync(seeded, null, token);
        return seeded;
    }

    private static string FindFixtureDirectory()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            for (var directory = new DirectoryInfo(start); directory is not null; directory = directory.Parent)
            {
                var candidate = Path.Combine(directory.FullName, "examples", "world-packages", "m2a-brick");
                if (File.Exists(Path.Combine(candidate, "index.js"))) return candidate;
            }
        }
        throw new DirectoryNotFoundException("The reviewed M2A brick package is missing from the installation.");
    }
}
