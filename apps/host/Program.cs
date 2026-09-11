using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Workspace.Host.Composition;
using Workspace.Host.Protocol;

var options = HostRuntimeOptions.Parse(args);
var composition = new VNextComposition();
var sessionToken = composition.InitializeSession(options);

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://127.0.0.1:{options.Port}");
var app = builder.Build();
app.UseWebSockets();

var endpoint = new WorkspaceSocketEndpoint(
    _ => null,
    (message, context, cancellationToken) => ValueTask.FromResult(HostCommandDispatchResult.Reject("command_not_wired")));

app.Map("/workspace", async context =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    var hello = await ReceiveTextAsync(socket, context.RequestAborted);
    if (!TryReadHello(hello, out var token) || !composition.Sessions.TryConsume(token!, out var session) || session is null)
    {
        await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "invalid_session", context.RequestAborted);
        return;
    }

    while (socket.State == WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
    {
        var json = await ReceiveTextAsync(socket, context.RequestAborted);
        if (json is null) break;
        var result = await endpoint.DispatchJsonAsync(json, session, context.RequestAborted);
        var response = JsonSerializer.Serialize(new { type = "command.result", protocolVersion = 1, accepted = result.Accepted, errorCode = result.ErrorCode });
        await socket.SendAsync(Encoding.UTF8.GetBytes(response), WebSocketMessageType.Text, true, context.RequestAborted);
    }
});

Console.WriteLine($"WORKSPACE_VNEXT_HOST=http://127.0.0.1:{options.Port}");
Console.WriteLine($"WORKSPACE_VNEXT_SESSION={sessionToken}");
await app.RunAsync();

static bool TryReadHello(string? json, out string? token)
{
    token = null;
    if (json is null) return false;
    try
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (!root.TryGetProperty("type", out var type) || type.GetString() != "session.hello") return false;
        if (!root.TryGetProperty("token", out var value) || value.ValueKind != JsonValueKind.String) return false;
        token = value.GetString();
        return !string.IsNullOrWhiteSpace(token);
    }
    catch (JsonException) { return false; }
}

static async Task<string?> ReceiveTextAsync(WebSocket socket, CancellationToken cancellationToken)
{
    var buffer = new byte[64 * 1024];
    using var stream = new MemoryStream();
    while (true)
    {
        var result = await socket.ReceiveAsync(buffer, cancellationToken);
        if (result.MessageType == WebSocketMessageType.Close) return null;
        if (result.MessageType != WebSocketMessageType.Text) throw new InvalidDataException("Only text WebSocket messages are accepted.");
        stream.Write(buffer, 0, result.Count);
        if (stream.Length > 1_048_576) throw new InvalidDataException("WebSocket message too large.");
        if (result.EndOfMessage) return Encoding.UTF8.GetString(stream.ToArray());
    }
}
