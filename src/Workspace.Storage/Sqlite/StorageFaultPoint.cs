namespace Workspace.Storage.Sqlite;

public enum StorageFaultPoint
{
    AfterBlobInsert,
    BeforeStateCommit,
    AfterStateCommit,
}

public interface IStorageFaultInjector
{
    void Hit(StorageFaultPoint point);
}

public sealed class InjectedStorageFaultException(StorageFaultPoint point)
    : Exception($"Injected storage fault at {point}.")
{
    public StorageFaultPoint Point { get; } = point;
}

internal sealed class NoStorageFaults : IStorageFaultInjector
{
    public static readonly NoStorageFaults Instance = new();
    public void Hit(StorageFaultPoint point) { }
}
