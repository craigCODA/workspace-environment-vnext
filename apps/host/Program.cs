using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.History;
using Workspace.Core.World;
using Workspace.Host.Composition;
using Workspace.Host.Protocol;
using Workspace.Storage.Sqlite;

var options = HostRuntimeOptions.Parse(args);
var composition = new VNextComposition();
var sessionToken = composition.InitializeSession(options);
var stateRoot = options.StateRoot ?? Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "WorkspaceEnvironmentVNext");
var databasePath = Path.Combine(stateRoot, "workspace-vnext.db");
await using var store = await SqliteWorldStore.OpenAsync(databasePath);
var initial = await store.LoadAsync(CancellationToken.None);
if (options.Acceptance && initial.Entities.Count == 0)
{
    var box = WorldEntity.Create("entity:box", "Box");
    initial = new WorldState(new Dictionary<string, WorldEntity>(StringComparer.Ordinal)
    {
        [box.Id] = box,
    }, 0);
    await store.PersistAcceptedAsync(initial, null, CancellationToken.None);
}
var engine = new WorldEngine(initial, store);
var commands = new WorkspaceCommandService(engine, store);

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://127.0.0.1:{options.Port}");
var app = builder.Build();
app.UseWebSockets();

var endpoint = new WorkspaceSocketEndpoint(
    _ => null,
    commands.DispatchAsync);

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

    try
    {
        while (socket.State == WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
        {
            var json = await ReceiveTextAsync(socket, context.RequestAborted);
            if (json is null) break;
            var result = await endpoint.DispatchJsonAsync(json, session, context.RequestAborted);
            var response = JsonSerializer.Serialize(new
            {
                type = "command.result",
                protocolVersion = 1,
                requestId = result.RequestId,
                accepted = result.Accepted,
                errorCode = result.ErrorCode,
                payload = result.Payload,
            });
            await socket.SendAsync(Encoding.UTF8.GetBytes(response), WebSocketMessageType.Text, true, context.RequestAborted);
        }
    }
    finally
    {
        commands.CancelSession(session.SessionId);
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
