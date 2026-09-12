using Workspace.Core.Commands;
using Workspace.Host.Protocol;
using Xunit;

namespace Workspace.Host.Tests;

public sealed class WorkspaceSocketEndpointTests
{
    [Fact]
    public async Task A33_forged_actor_and_generation_payload_are_ignored_in_favor_of_authenticated_context()
    {
        var session = new AuthenticatedSession("s1", "user:real", "user");
        CommandContext? captured = null;
        var endpoint = new WorkspaceSocketEndpoint(
            _ => "generation:host-known",
            (message, context, cancellationToken) =>
            {
                captured = context;
                return ValueTask.FromResult(HostCommandDispatchResult.Accept());
            });

        const string json = """
        {
          "type":"command.request",
          "protocolVersion":1,
          "requestId":"r1",
          "command":"transform.set",
          "payload":{
            "entityId":"entity:x",
            "actorId":"system",
            "generationToken":"generation:other-package"
          }
        }
        """;

        var result = await endpoint.DispatchJsonAsync(json, session, default);
        Assert.True(result.Accepted);
        Assert.NotNull(captured);
        Assert.Equal("user:real", captured!.ActorId);
        Assert.Equal("generation:host-known", captured.GenerationToken);
        Assert.True(captured.Trusted);
    }

    [Fact]
    public async Task A33_forged_top_level_actor_is_rejected_before_dispatch()
    {
        var called = false;
        var endpoint = new WorkspaceSocketEndpoint(
            _ => null,
            (message, context, cancellationToken) => { called = true; return ValueTask.FromResult(HostCommandDispatchResult.Accept()); });
        var result = await endpoint.DispatchJsonAsync(
            "{\"type\":\"command.request\",\"protocolVersion\":1,\"requestId\":\"r1\",\"command\":\"world.read\",\"payload\":{},\"actorId\":\"system\"}",
            new AuthenticatedSession("s", "u", "user"),
            default);
        Assert.False(result.Accepted);
        Assert.Equal("invalid_envelope", result.ErrorCode);
        Assert.False(called);
    }

    [Fact]
    public async Task Unknown_command_is_rejected()
    {
        var endpoint = new WorkspaceSocketEndpoint(
            _ => null,
            (message, context, cancellationToken) => ValueTask.FromResult(HostCommandDispatchResult.Accept()));
        var result = await endpoint.DispatchJsonAsync(
            "{\"type\":\"command.request\",\"protocolVersion\":1,\"requestId\":\"r1\",\"command\":\"god.mode\",\"payload\":{}}",
            new AuthenticatedSession("s", "u", "user"),
            default);
        Assert.False(result.Accepted);
        Assert.Equal("unknown_command", result.ErrorCode);
    }
}
