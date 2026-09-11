using System.Text.Json;
using Workspace.Core.Ports;
using Workspace.Host.Protocol;
using Xunit;

namespace Workspace.Host.Tests;

public sealed class RendererRuntimeGatewayTests
{
    [Fact]
    public async Task Prepare_requires_matching_candidate_and_generation_and_sends_schema_conforming_identity()
    {
        var channel = new FakeChannel
        {
            Response = JsonSerializer.SerializeToElement(new
            {
                type = "runtime.prepared",
                protocolVersion = 1,
                candidateId = "candidate:other",
                generationToken = "generation:1"
            })
        };
        var gateway = new RendererRuntimeGateway(channel, TimeSpan.FromSeconds(1));
        var candidate = Candidate("candidate:1", "generation:1");

        var result = await gateway.PrepareAsync(candidate, default);

        Assert.False(result.Prepared);
        Assert.Equal("runtime_response_mismatch", result.ErrorCode);
        Assert.Equal("entity:x", channel.LastRequest.GetProperty("entityId").GetString());
        Assert.False(channel.LastRequest.TryGetProperty("packageId", out _));
        Assert.False(channel.LastRequest.TryGetProperty("revisionDigest", out _));
    }

    [Fact]
    public async Task Prepare_times_out_without_committing_readiness()
    {
        var channel = new FakeChannel { WaitForever = true };
        var gateway = new RendererRuntimeGateway(channel, TimeSpan.FromMilliseconds(20));

        var result = await gateway.PrepareAsync(Candidate("candidate:1", "generation:1"), default);

        Assert.False(result.Prepared);
        Assert.Equal("runtime_prepare_timeout", result.ErrorCode);
    }

    [Fact]
    public async Task Prepared_response_after_generation_retirement_is_ignored()
    {
        var channel = new FakeChannel { ManualResponse = true };
        var gateway = new RendererRuntimeGateway(channel, TimeSpan.FromSeconds(1));
        var prepareTask = gateway.PrepareAsync(Candidate("candidate:1", "generation:1"), default);
        await channel.RequestStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));

        await gateway.RetireAsync("generation:1", default);
        channel.Complete(JsonSerializer.SerializeToElement(new
        {
            type = "runtime.prepared",
            protocolVersion = 1,
            candidateId = "candidate:1",
            generationToken = "generation:1"
        }));

        var result = await prepareTask;
        Assert.False(result.Prepared);
        Assert.Equal("generation_retired", result.ErrorCode);
    }

    private static PackageCandidate Candidate(string candidateId, string generationToken) =>
        new(candidateId, "entity:x", "pkg:x", "sha256:rev", generationToken, "source", "{}", 0);

    private sealed class FakeChannel : IRendererRuntimeChannel
    {
        private readonly TaskCompletionSource<JsonElement> _response = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public JsonElement Response { get; set; }
        public JsonElement LastRequest { get; private set; }
        public bool WaitForever { get; init; }
        public bool ManualResponse { get; init; }
        public TaskCompletionSource RequestStarted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<JsonElement> RequestAsync(JsonElement message, CancellationToken cancellationToken)
        {
            LastRequest = message.Clone();
            RequestStarted.TrySetResult();
            if (WaitForever) await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            if (ManualResponse) return await _response.Task.WaitAsync(cancellationToken);
            return Response;
        }

        public Task SendAsync(JsonElement message, CancellationToken cancellationToken) => Task.CompletedTask;
        public void Complete(JsonElement response) => _response.TrySetResult(response);
    }
}
