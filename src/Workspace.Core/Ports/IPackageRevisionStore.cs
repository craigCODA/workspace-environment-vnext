namespace Workspace.Core.Ports;

public sealed record PackageRevisionArtifact(
    string PackageId,
    string RevisionDigest,
    string ManifestJson,
    string Source);

public interface IPackageRevisionStore
{
    Task StagePackageRevisionAsync(PackageRevisionArtifact revision, CancellationToken cancellationToken);
}
