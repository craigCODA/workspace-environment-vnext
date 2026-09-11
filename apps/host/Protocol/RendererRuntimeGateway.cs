using System.Text.Json;
using Workspace.Core.Ports;

namespace Workspace.Host.Protocol;

public interface IRendererRuntimeChannel
{
    Task<JsonElement> RequestAsync(JsonElement message, CancellationToken cancellationToken);
    Task SendAsync(JsonElement message, CancellationToken cancellationToken);
}

public sealed class RendererRuntimeGateway(IRendererRuntimeChannel channel) : IRuntimeGateway
{
    private readonly IRendererRuntimeChannel _channel = channel;

    public async Task<RuntimePrepareResult> PrepareAsync(PackageCandidate candidate, CancellationToken cancellationToken)
    {
        var response = await _channel.RequestAsync(JsonSerializer.SerializeToElement(new
        {
            type = "runtime.prepare",
            protocolVersion = 1,
            candidateId = candidate.CandidateId,
            packageId = candidate.PackageId,
            revisionDigest = candidate.RevisionDigest,
            generationToken = candidate.GenerationToken,
            source = candidate.Source,
            manifestJson = candidate.ManifestJson,
        }), cancellationToken);
        return response.TryGetProperty("type", out var type) && type.GetString() == "runtime.prepared"
            ? new RuntimePrepareResult(true, null)
            : new RuntimePrepareResult(false, response.TryGetProperty("errorCode", out var error) ? error.GetString() : "runtime_prepare_failed");
    }

    public Task ActivateAsync(string entityId, string revisionDigest, string generationToken, CancellationToken cancellationToken) =>
        _channel.SendAsync(JsonSerializer.SerializeToElement(new { type = "runtime.activate", protocolVersion = 1, entityId, revisionDigest, generationToken }), cancellationToken);

    public Task RetireAsync(string generationToken, CancellationToken cancellationToken) =>
        _channel.SendAsync(JsonSerializer.SerializeToElement(new { type = "runtime.retire", protocolVersion = 1, generationToken }), cancellationToken);
}
