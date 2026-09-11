using Workspace.Core.Commands;
using Workspace.Core.Ports;

namespace Workspace.Runtime.Packages;

public sealed record PackagePublishRequest(
    string EntityId,
    string PackageId,
    string Source,
    string ManifestJson,
    int BaseImplementationRevision);

public sealed record PackagePublishResult(bool Published, string? ErrorCode, string? RevisionDigest, string? GenerationToken);

public sealed class PackageCoordinator
{
    private readonly WorldEngine _world;
    private readonly IRuntimeGateway _runtime;

    public PackageCoordinator(WorldEngine world, IRuntimeGateway runtime)
    {
        _world = world;
        _runtime = runtime;
    }

    public async Task<PackagePublishResult> PublishAsync(
        PackagePublishRequest request,
        CommandContext context,
        CancellationToken cancellationToken)
    {
        var policy = PackageManifestPolicy.Validate(request.ManifestJson);
        if (!policy.AllowedToActivate) return new(false, policy.ErrorCode, null, null);
        if (!_world.Current.Entities.TryGetValue(request.EntityId, out var entity)) return new(false, "entity_not_found", null, null);
        if (entity.Revisions.Implementation != request.BaseImplementationRevision) return new(false, "revision_conflict", null, null);

        var digest = PackageDigest.Compute(request.ManifestJson, request.Source);
        var generation = $"generation:{Guid.NewGuid():N}";
        var candidate = new PackageCandidate(
            $"candidate:{Guid.NewGuid():N}",
            request.PackageId,
            digest,
            generation,
            request.Source.Replace("\r\n", "\n", StringComparison.Ordinal),
            request.ManifestJson,
            request.BaseImplementationRevision);

        var prepared = await _runtime.PrepareAsync(candidate, cancellationToken);
        if (!prepared.Prepared) return new(false, prepared.ErrorCode ?? "prepare_failed", null, null);

        // M1 stages runtime preparation before any durable world activation. The actual
        // package-binding world command is introduced with the lifecycle command slice;
        // until then, preparation success is deliberately not treated as publication.
        if (!_world.Current.Entities.TryGetValue(request.EntityId, out entity) || entity.Revisions.Implementation != request.BaseImplementationRevision)
            return new(false, "revision_conflict", null, null);

        return new(false, "activation_command_not_available", digest, generation);
    }
}
