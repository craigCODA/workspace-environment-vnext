namespace Workspace.Core.World;

public sealed record PackageBinding(
    string PackageId,
    string RevisionDigest,
    string GenerationToken,
    bool Active = true);
