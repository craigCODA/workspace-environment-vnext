using System.Text.Json;
using Microsoft.Data.Sqlite;
using Workspace.Core.History;
using Workspace.Core.Ports;
using Workspace.Core.World;

namespace Workspace.Storage.Sqlite;

public sealed class SqliteWorldStore : IWorldStore, IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly SqliteConnection _connection;
    private readonly IStorageFaultInjector _faults;

    private SqliteWorldStore(SqliteConnection connection, IStorageFaultInjector faults)
    {
        _connection = connection;
        _faults = faults;
    }

    public static async Task<SqliteWorldStore> OpenAsync(
        string path,
        IStorageFaultInjector? faults = null,
        CancellationToken cancellationToken = default)
    {
        var fullPath = Path.GetFullPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = fullPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
        }.ToString());
        await connection.OpenAsync(cancellationToken);
        var store = new SqliteWorldStore(connection, faults ?? NoStorageFaults.Instance);
        await store.InitializeAsync(cancellationToken);
        return store;
    }

    private async Task InitializeAsync(CancellationToken cancellationToken)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText = SqliteSchema.Create;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<WorldState> LoadAsync(CancellationToken cancellationToken)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText = "SELECT document_json FROM world_state WHERE singleton = 1;";
        var value = await command.ExecuteScalarAsync(cancellationToken);
        if (value is not string json) return WorldState.Empty;
        return Deserialize(json);
    }

    public async Task PersistAcceptedAsync(
        WorldState state,
        HistoryEntry? history,
        CancellationToken cancellationToken)
    {
        await using var transaction = await _connection.BeginTransactionAsync(cancellationToken);
        await UpsertWorldStateAsync(state, transaction, cancellationToken);
        _faults.Hit(StorageFaultPoint.BeforeStateCommit);
        await transaction.CommitAsync(cancellationToken);
        _faults.Hit(StorageFaultPoint.AfterStateCommit);
    }

    public async Task SaveCheckpointAsync(WorldState state, CancellationToken cancellationToken)
    {
        await using (var transaction = await _connection.BeginTransactionAsync(cancellationToken))
        {
            await using var command = _connection.CreateCommand();
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = """
                INSERT INTO explicit_checkpoints(id, world_revision, created_utc, document_json)
                VALUES ($id, $revision, $created, $json);
                """;
            command.Parameters.AddWithValue("$id", $"checkpoint:{Guid.NewGuid():N}");
            command.Parameters.AddWithValue("$revision", state.WorldRevision);
            command.Parameters.AddWithValue("$created", DateTimeOffset.UtcNow.ToString("O"));
            command.Parameters.AddWithValue("$json", Serialize(state));
            await command.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        await using var checkpoint = _connection.CreateCommand();
        checkpoint.CommandText = "PRAGMA wal_checkpoint(FULL);";
        await checkpoint.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<WorldState?> LoadLatestCheckpointAsync(CancellationToken cancellationToken)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText = "SELECT document_json FROM explicit_checkpoints ORDER BY rowid DESC LIMIT 1;";
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is string json ? Deserialize(json) : null;
    }

    public async Task PutPackageBlobAsync(
        string digest,
        string mediaType,
        byte[] content,
        CancellationToken cancellationToken)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText = "INSERT OR IGNORE INTO package_blobs(digest, media_type, content) VALUES ($digest, $media, $content);";
        command.Parameters.AddWithValue("$digest", digest);
        command.Parameters.AddWithValue("$media", mediaType);
        command.Parameters.Add("$content", SqliteType.Blob).Value = content;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task PublishPackageRevisionAsync(
        WorldState nextState,
        string revisionDigest,
        string packageId,
        string manifestJson,
        string mediaType,
        byte[] source,
        CancellationToken cancellationToken)
    {
        await using var transaction = await _connection.BeginTransactionAsync(cancellationToken);

        await using (var blob = _connection.CreateCommand())
        {
            blob.Transaction = (SqliteTransaction)transaction;
            blob.CommandText = "INSERT OR IGNORE INTO package_blobs(digest, media_type, content) VALUES ($digest, $media, $content);";
            blob.Parameters.AddWithValue("$digest", revisionDigest);
            blob.Parameters.AddWithValue("$media", mediaType);
            blob.Parameters.Add("$content", SqliteType.Blob).Value = source;
            await blob.ExecuteNonQueryAsync(cancellationToken);
        }
        _faults.Hit(StorageFaultPoint.AfterBlobInsert);

        await using (var revision = _connection.CreateCommand())
        {
            revision.Transaction = (SqliteTransaction)transaction;
            revision.CommandText = """
                INSERT OR IGNORE INTO package_revisions(digest, package_id, manifest_json, source_digest, created_utc)
                VALUES ($digest, $package, $manifest, $source, $created);
                """;
            revision.Parameters.AddWithValue("$digest", revisionDigest);
            revision.Parameters.AddWithValue("$package", packageId);
            revision.Parameters.AddWithValue("$manifest", manifestJson);
            revision.Parameters.AddWithValue("$source", revisionDigest);
            revision.Parameters.AddWithValue("$created", DateTimeOffset.UtcNow.ToString("O"));
            await revision.ExecuteNonQueryAsync(cancellationToken);
        }

        await UpsertWorldStateAsync(nextState, transaction, cancellationToken);
        _faults.Hit(StorageFaultPoint.BeforeStateCommit);
        await transaction.CommitAsync(cancellationToken);
        _faults.Hit(StorageFaultPoint.AfterStateCommit);
    }

    public async Task<bool> ActiveReferencesMissingBlobAsync(CancellationToken cancellationToken)
    {
        var state = await LoadAsync(cancellationToken);
        foreach (var binding in state.Entities.Values.Select(x => x.PackageBinding).Where(x => x is not null))
        {
            await using var command = _connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM package_blobs WHERE digest = $digest;";
            command.Parameters.AddWithValue("$digest", binding!.RevisionDigest);
            var count = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
            if (count == 0) return true;
        }
        return false;
    }

    private async Task UpsertWorldStateAsync(
        WorldState state,
        System.Data.Common.DbTransaction transaction,
        CancellationToken cancellationToken)
    {
        await using var command = _connection.CreateCommand();
        command.Transaction = (SqliteTransaction)transaction;
        command.CommandText = """
            INSERT INTO world_state(singleton, world_revision, document_json)
            VALUES (1, $revision, $json)
            ON CONFLICT(singleton) DO UPDATE SET
              world_revision = excluded.world_revision,
              document_json = excluded.document_json;
            """;
        command.Parameters.AddWithValue("$revision", state.WorldRevision);
        command.Parameters.AddWithValue("$json", Serialize(state));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string Serialize(WorldState state) => JsonSerializer.Serialize(state, JsonOptions);

    private static WorldState Deserialize(string json) =>
        JsonSerializer.Deserialize<WorldState>(json, JsonOptions)
        ?? throw new InvalidDataException("World state JSON was empty.");

    public async ValueTask DisposeAsync() => await _connection.DisposeAsync();
}
