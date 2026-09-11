namespace Workspace.Runtime.Packages;

public sealed record ForkedPackageDefinition(
    string PackageId,
    string LineageParentPackageId,
    string Source);

public static class PackageForker
{
    public static ForkedPackageDefinition Fork(string parentPackageId, string newPackageId, string source)
    {
        if (string.IsNullOrWhiteSpace(parentPackageId)) throw new ArgumentException("Parent package ID is required.", nameof(parentPackageId));
        if (string.IsNullOrWhiteSpace(newPackageId) || newPackageId == parentPackageId) throw new ArgumentException("Fork package ID must be new.", nameof(newPackageId));
        return new ForkedPackageDefinition(newPackageId, parentPackageId, source);
    }
}
