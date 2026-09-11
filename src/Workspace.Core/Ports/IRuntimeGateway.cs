namespace Workspace.Core.Ports;

public sealed record PackageCandidate(
    string CandidateId,
    string EntityId,
    string PackageId,
    string RevisionDigest,
    string GenerationToken,
    string Source,
    string ManifestJson,
    int BaseImplementationRevision);

public sealed record RuntimePrepareResult(bool Prepared, string? ErrorCode);

public interface IRuntimeGateway
{
    Task<RuntimePrepareResult> PrepareAsync(PackageCandidate candidate, CancellationToken cancellationToken);
    Task ActivateAsync(string entityId, string revisionDigest, string generationToken, CancellationToken cancellationToken);
    Task RetireAsync(string generationToken, CancellationToken cancellationToken);
}
