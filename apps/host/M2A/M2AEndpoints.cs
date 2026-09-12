using System.Diagnostics;
using System.Text.Json;
using Workspace.Core.World;
using Workspace.Host.Protocol;
using Workspace.Runtime.Applications;

namespace Workspace.Host.M2A;

public static class M2AEndpoints
{
    public static void Map(WebApplication app, WorkspaceCommandService commands, SessionAuthenticator sessions)
    {
        app.MapGet("/m2a/surfaces/{entityId}/frame", async (string entityId, HttpContext context) =>
        {
            if (Authorize(context, sessions) is null) return Results.StatusCode(403);
            var entity = Surface(commands.Current, entityId);
            if (entity is null) return Results.NotFound(new { error = "surface_not_found" });
            if (!long.TryParse(context.Request.Query["after"], out var after) || after < 0) after = 0;
            var read = await commands.Applications!.ReadFrameAsync(entity, after, context.RequestAborted);
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers["X-Workspace-Capture"] = read.Status;
            if (read.Frame is null) return Results.NoContent();
            context.Response.Headers["X-Frame-Sequence"] = read.Frame.Sequence.ToString(System.Globalization.CultureInfo.InvariantCulture);
            context.Response.Headers["X-Frame-Width"] = read.Frame.Width.ToString(System.Globalization.CultureInfo.InvariantCulture);
            context.Response.Headers["X-Frame-Height"] = read.Frame.Height.ToString(System.Globalization.CultureInfo.InvariantCulture);
            return Results.File(read.Frame.Data, read.Frame.MimeType);
        });

        app.MapPost("/m2a/surfaces/{entityId}/control", async (string entityId, HttpContext context) =>
        {
            var session = Authorize(context, sessions);
            if (session is null) return Results.StatusCode(403);
            var entity = Surface(commands.Current, entityId);
            if (entity is null) return Results.NotFound(new { error = "surface_not_found" });
            try
            {
                var request = await context.Request.ReadFromJsonAsync<ControlRequest>(context.RequestAborted);
                var lease = await commands.Applications!.AcquireControlAsync(entity, session.SessionId, request?.Mode ?? "messages", context.RequestAborted);
                return Results.Json(new { leaseId = lease.Id, expiresAt = lease.ExpiresAt, mode = lease.Mode });
            }
            catch (PlatformOperationException error) { return Results.BadRequest(new { error = error.Code }); }
            catch (JsonException) { return Results.BadRequest(new { error = "invalid_payload" }); }
            catch (BadHttpRequestException) { return Results.BadRequest(new { error = "invalid_payload" }); }
        });

        app.MapPost("/m2a/surfaces/{entityId}/input", async (string entityId, HttpContext context) =>
        {
            var session = Authorize(context, sessions);
            if (session is null) return Results.StatusCode(403);
            var entity = Surface(commands.Current, entityId);
            if (entity is null) return Results.NotFound(new { error = "surface_not_found" });
            try
            {
                var input = await context.Request.ReadFromJsonAsync<SurfaceInput>(context.RequestAborted);
                if (input is null) return Results.BadRequest(new { error = "invalid_input" });
                await commands.Applications!.InputAsync(entity, session.SessionId, context.Request.Headers["x-workspace-control"].ToString(), input, context.RequestAborted);
                return Results.Json(new { accepted = true });
            }
            catch (PlatformOperationException error) { return Results.BadRequest(new { error = error.Code }); }
            catch (JsonException) { return Results.BadRequest(new { error = "invalid_payload" }); }
            catch (BadHttpRequestException) { return Results.BadRequest(new { error = "invalid_payload" }); }
        });

        app.MapDelete("/m2a/control", async (HttpContext context) =>
        {
            var session = Authorize(context, sessions);
            if (session is null) return Results.StatusCode(403);
            await commands.Applications!.ReleaseSessionAsync(session.SessionId, context.RequestAborted);
            return Results.NoContent();
        });
    }

    public static async Task MonitorParentAsync(int parentId, IHostApplicationLifetime lifetime)
    {
        try
        {
            using var parent = Process.GetProcessById(parentId);
            await parent.WaitForExitAsync(lifetime.ApplicationStopping);
            lifetime.StopApplication();
        }
        catch (ArgumentException) { lifetime.StopApplication(); }
        catch (OperationCanceledException) when (lifetime.ApplicationStopping.IsCancellationRequested) { }
    }

    private static AuthenticatedSession? Authorize(HttpContext context, SessionAuthenticator sessions) =>
        sessions.TryAuthorize(context.Request.Headers["x-workspace-session"].ToString(), out var session) && session?.Trusted == true ? session : null;

    private static WorldEntity? Surface(WorldState state, string entityId) =>
        state.Entities.TryGetValue(entityId, out var entity) && M2AWorld.Kind(entity) == "surface" ? entity : null;

    private sealed record ControlRequest(string Mode);
}
