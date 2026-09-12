using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Workspace.Core.Commands;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;
using Workspace.Host.Composition;
using Workspace.Host.Protocol;
using Workspace.Runtime.Packages;
using Workspace.Storage.Sqlite;

var options = HostRuntimeOptions.Parse(args);
var composition = new VNextComposition();
var sessionToken = composition.InitializeSession(options);
var stateRoot = options.StateRoot ?? Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "WorkspaceEnvironmentVNext");
var databasePath = Path.Combine(stateRoot, "workspace-vnext.db");
await using var store = await SqliteWorldStore.OpenAsync(databasePath);
var packageRevisions = new SqlitePackageRevisionStore(databasePath);
var initial = await store.LoadAsync(CancellationToken.None);
if (options.Acceptance && initial.Entities.Count == 0)
{
    var packageDirectory = FindAcceptancePackageDirectory();
    var manifestJson = await File.ReadAllTextAsync(Path.Combine(packageDirectory, "manifest.json"));
    var source = (await File.ReadAllTextAsync(Path.Combine(packageDirectory, "index.js"))).Replace("\r\n", "\n", StringComparison.Ordinal);
    var revisionDigest = PackageDigest.Compute(manifestJson, source);
    var generationToken = $"generation:m1-breadth:{revisionDigest[..16]}";
    await packageRevisions.StagePackageRevisionAsync(
        new PackageRevisionArtifact("pkg:m1-breadth", revisionDigest, manifestJson, source),
        CancellationToken.None);

    var box = WorldEntity.Create("entity:box", "Box") with
    {
        PackageBinding = new PackageBinding("pkg:m1-breadth", revisionDigest, generationToken, true),
    };
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
builder.Services.AddCors(cors => cors.AddPolicy("trusted-spatial", policy => policy
    .SetIsOriginAllowed(origin => Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback)
    .AllowAnyMethod()
    .AllowAnyHeader()));
var app = builder.Build();
app.UseCors("trusted-spatial");
app.UseWebSockets();


const string acceptanceAssetHandle = "asset:sha256:c21b35e3f28e676cedf24c13575a7346682e101a2d26aad9598d0cdbcee9ee3b";
var acceptanceAssetRgba = new byte[]
{
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
};

app.MapGet("/assets/resolve", (HttpContext context) =>
{
    if (!TryAuthorizeHttp(context, composition.Sessions)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var handle = context.Request.Query["handle"].ToString();
    if (!IsHostAssetHandle(handle)) return Results.BadRequest(new { error = "invalid_host_asset_handle" });
    if (!string.Equals(handle, acceptanceAssetHandle, StringComparison.Ordinal)) return Results.NotFound();
    return Results.Json(new
    {
        width = 2,
        height = 2,
        rgbaBase64 = Convert.ToBase64String(acceptanceAssetRgba),
    });
});

app.MapGet("/packages/revision/{digest}", async (string digest, HttpContext context) =>
{
    if (!TryAuthorizeHttp(context, composition.Sessions)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (!IsSha256Digest(digest)) return Results.BadRequest(new { error = "invalid_revision_digest" });
    var revision = await packageRevisions.LoadPackageRevisionAsync(digest, context.RequestAborted);
    if (revision is null) return Results.NotFound();
    return Results.Json(new
    {
        packageId = revision.PackageId,
        revisionDigest = revision.RevisionDigest,
        manifestJson = revision.ManifestJson,
        source = revision.Source,
    });
});

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

    var connectionSession = session with
    {
        SessionId = $"{session.SessionId}:connection:{Guid.NewGuid():N}",
    };

    try
    {
        while (socket.State == WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
        {
            var json = await ReceiveTextAsync(socket, context.RequestAborted);
            if (json is null) break;
            var result = await endpoint.DispatchJsonAsync(json, connectionSession, context.RequestAborted);
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
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
    }
    catch (WebSocketException)
    {
    }
    finally
    {
        commands.ReleaseSessionLeases(connectionSession.SessionId);
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

static string FindAcceptancePackageDirectory()
{
    for (var directory = new DirectoryInfo(Directory.GetCurrentDirectory()); directory is not null; directory = directory.Parent)
    {
        var candidate = Path.Combine(directory.FullName, "examples", "world-packages", "m1-breadth");
        if (File.Exists(Path.Combine(candidate, "manifest.json")) && File.Exists(Path.Combine(candidate, "index.js")))
            return candidate;
    }
    throw new DirectoryNotFoundException("M1 breadth package fixture was not found from the host working directory.");
}

static bool TryAuthorizeHttp(HttpContext context, SessionAuthenticator sessions)
{
    var token = context.Request.Headers["x-workspace-session"].ToString();
    return !string.IsNullOrWhiteSpace(token) && sessions.TryAuthorize(token, out _);
}

static bool IsHostAssetHandle(string value)
{
    const string prefix = "asset:sha256:";
    return value.StartsWith(prefix, StringComparison.Ordinal)
        && IsSha256Digest(value[prefix.Length..]);
}

static bool IsSha256Digest(string value) => value.Length == 64 && value.All(static character =>
    character is >= '0' and <= '9' or >= 'a' and <= 'f');

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
