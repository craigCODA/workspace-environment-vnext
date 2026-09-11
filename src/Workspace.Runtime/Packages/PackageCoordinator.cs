using Workspace.Core.Commands;
using Workspace.Core.Ports;
using Workspace.Core.World;

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
    private readonly IPackageRevisionStore? _revisionStore;

    public PackageCoordinator(WorldEngine world, IRuntimeGateway runtime, IPackageRevisionStore? revisionStore = null)
    {
        _world = world;
        _runtime = runtime;
        _revisionStore = revisionStore;
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

        var oldBinding = entity.PackageBinding;
        var digest = PackageDigest.Compute(request.ManifestJson, request.Source);
        var generation = $"generation:{Guid.NewGuid():N}";
        var normalizedSource = request.Source.Replace("\r\n", "\n", StringComparison.Ordinal);
        var candidate = new PackageCandidate(
            $"candidate:{Guid.NewGuid():N}",
            request.PackageId,
            digest,
            generation,
            normalizedSource,
            request.ManifestJson,
            request.BaseImplementationRevision);

        if (_revisionStore is not null)
        {
            await _revisionStore.StagePackageRevisionAsync(
                new PackageRevisionArtifact(request.PackageId, digest, request.ManifestJson, normalizedSource),
                cancellationToken);
        }

        var prepared = await _runtime.PrepareAsync(candidate, cancellationToken);
        if (!prepared.Prepared) return new(false, prepared.ErrorCode ?? "prepare_failed", null, null);

        if (!_world.Current.Entities.TryGetValue(request.EntityId, out entity) || entity.Revisions.Implementation != request.BaseImplementationRevision)
        {
            await _runtime.RetireAsync(generation, cancellationToken);
            return new(false, "revision_conflict", null, null);
        }

        var commit = await _world.ExecuteAsync(
            new PackageActivateCommand(
                $"activate:{candidate.CandidateId}",
                request.EntityId,
                request.PackageId,
                digest,
                generation,
                new Dictionary<RevisionPlane, long> { [RevisionPlane.Implementation] = request.BaseImplementationRevision }),
            context,
            cancellationToken);

        if (!commit.Accepted)
        {
            await _runtime.RetireAsync(generation, cancellationToken);
            return new(false, commit.ErrorCode ?? "activation_commit_failed", null, null);
        }

        try
        {
            await _runtime.ActivateAsync(request.EntityId, digest, generation, cancellationToken);
            if (oldBinding is not null && oldBinding.GenerationToken != generation)
                await _runtime.RetireAsync(oldBinding.GenerationToken, cancellationToken);
            return new(true, null, digest, generation);
        }
        catch
        {
            var current = _world.Current.Entities[request.EntityId];
            if (oldBinding is not null)
            {
                await _world.ExecuteAsync(
                    new PackageRollbackCommand(
                        $"rollback:{candidate.CandidateId}",
                        request.EntityId,
                        oldBinding.RevisionDigest,
                        oldBinding.GenerationToken,
                        new Dictionary<RevisionPlane, long> { [RevisionPlane.Implementation] = current.Revisions.Implementation }),
                    context,
                    cancellationToken);
            }
            else
            {
                await _world.ExecuteAsync(
                    new PackageDisableCommand(
                        $"disable:{candidate.CandidateId}",
                        request.EntityId,
                        new Dictionary<RevisionPlane, long> { [RevisionPlane.Implementation] = current.Revisions.Implementation }),
                    context,
                    cancellationToken);
            }
            await _runtime.RetireAsync(generation, cancellationToken);
            return new(false, "runtime_activation_failed", null, null);
        }
    }
}
