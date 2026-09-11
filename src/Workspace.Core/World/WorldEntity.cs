using System.Text.Json;

namespace Workspace.Core.World;

public sealed record WorldEntity(
    string Id,
    string Name,
    string? ParentId,
    TransformState Transform,
    IReadOnlyDictionary<string, JsonElement> Parameters,
    IReadOnlyList<WorldRelationship> Relationships,
    PackageBinding? PackageBinding,
    RevisionVector Revisions)
{
    public static WorldEntity Create(string id, string name) => new(
        id,
        name,
        null,
        TransformState.Identity,
        new Dictionary<string, JsonElement>(StringComparer.Ordinal),
        Array.Empty<WorldRelationship>(),
        null,
        RevisionVector.Zero);
}
