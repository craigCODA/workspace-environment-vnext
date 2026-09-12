using System.Text.Json;
using Workspace.Core.World;
using Workspace.Runtime.Applications;
using Xunit;

namespace Workspace.Runtime.Tests;

public sealed class M2APlatformTests
{
    private static readonly WindowSelector Selector = new("app:test", "C:/test.exe", "TestClass", "Document");
    private static DiscoveredWindow Window(string id, string title = "Document") => new(id, title, "Example", Selector with { TitleHint = title }, false, true, null);

    [Fact]
    public void Selector_requires_unique_match_and_never_chooses_first_of_two()
    {
        Assert.Equal("one", WindowSelector.Match(Selector, new[] { Window("one") })?.Id);
        Assert.Null(WindowSelector.Match(Selector, new[] { Window("one"), Window("two") }));
        Assert.Null(WindowSelector.Match(Selector, new[] { Window("bad") with { Selector = Selector with { ApplicationId = "different" } } }));
        Assert.Equal("one", WindowSelector.Match(Selector, new[] { Window("one"), Window("two", "Other document") })?.Id);
    }

    [Fact]
    public async Task Control_lease_rejects_foreign_session_and_releases_on_exit()
    {
        var platform = new TestPlatform();
        await using var surfaces = new ApplicationSurfaceService(platform);
        var entity = Surface();
        var lease = await surfaces.AcquireControlAsync(entity, "session:a", "messages", CancellationToken.None);
        await Assert.ThrowsAsync<PlatformOperationException>(() => surfaces.InputAsync(entity, "session:b", lease.Id, new SurfaceInput("text", Text: "hello"), CancellationToken.None));
        Assert.Empty(platform.Inputs);
        await surfaces.InputAsync(entity, "session:a", lease.Id, new SurfaceInput("text", Text: "hello"), CancellationToken.None);
        Assert.Single(platform.Inputs);
        await surfaces.ReleaseSessionAsync("session:a", CancellationToken.None);
        await Assert.ThrowsAsync<PlatformOperationException>(() => surfaces.InputAsync(entity, "session:a", lease.Id, new SurfaceInput("text", Text: "again"), CancellationToken.None));
        Assert.True(platform.Releases > 0);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Input_coordinates_are_bounded(double x)
    {
        Assert.Throws<PlatformOperationException>(() => SurfaceInput.Validate(new SurfaceInput("pointer", "move", x, 0.5)));
    }

    [Fact]
    public async Task Missing_saved_window_does_not_start_capture_or_input()
    {
        var platform = new TestPlatform { Windows = [] };
        await using var surfaces = new ApplicationSurfaceService(platform);
        var frame = await surfaces.ReadFrameAsync(Surface(), 0, CancellationToken.None);
        Assert.Equal("window_missing_or_ambiguous", frame.Status);
        Assert.Null(frame.Frame);
        Assert.Equal(0, platform.Captures);
    }

    [Fact]
    public async Task Capture_returns_actual_frame_and_releases_on_surface_removal()
    {
        var platform = new TestPlatform();
        await using var surfaces = new ApplicationSurfaceService(platform);
        var frame = await surfaces.ReadFrameAsync(Surface(), 0, CancellationToken.None);
        Assert.Equal("live", frame.Status);
        Assert.Equal(new byte[] { 1, 2, 3 }, frame.Frame!.Data);
        await surfaces.ReleaseSurfaceAsync("surface:test", CancellationToken.None);
        Assert.Equal(1, platform.Stops);
    }

    private static WorldEntity Surface() => WorldEntity.Create("surface:test", "Display") with
    {
        Parameters = new Dictionary<string, JsonElement>
        {
            ["kind"] = JsonSerializer.SerializeToElement("surface"),
            ["application"] = JsonSerializer.SerializeToElement(Selector, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
        },
    };

    private sealed class TestPlatform : IApplicationPlatform
    {
        public string Status => "available";
        public DiscoveredWindow[] Windows = [Window("one")];
        public int Captures, Stops, Releases;
        public List<SurfaceInput> Inputs = [];
        public Task<IReadOnlyList<DiscoveredWindow>> DiscoverAsync(CancellationToken token) => Task.FromResult<IReadOnlyList<DiscoveredWindow>>(Windows);
        public Task<string> StartCaptureAsync(string id, CancellationToken token) { Captures++; return Task.FromResult("stream:test"); }
        public ValueTask<WindowFrame?> ReadFrameAsync(string id, long after, CancellationToken token) => ValueTask.FromResult<WindowFrame?>(new(1, 640, 480, "image/png", [1, 2, 3]));
        public Task StopCaptureAsync(string id, CancellationToken token) { Stops++; return Task.CompletedTask; }
        public Task InputAsync(string id, SurfaceInput input, string mode, CancellationToken token) { Inputs.Add(input); return Task.CompletedTask; }
        public Task FocusAsync(string id, CancellationToken token) => Task.CompletedTask;
        public Task ReleaseInputAsync(CancellationToken token) { Releases++; return Task.CompletedTask; }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
