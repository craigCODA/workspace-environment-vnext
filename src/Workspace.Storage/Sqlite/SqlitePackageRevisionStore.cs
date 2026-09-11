using Microsoft.Data.Sqlite;
using Workspace.Core.Ports;

namespace Workspace.Storage.Sqlite;

public sealed class SqlitePackageRevisionStore(string databasePath) : IPackageRevisionStore
{
    private readonly string _databasePath = Path.GetFullPath(databasePath);

    public async Task StagePackageRevisionAsync(PackageRevisionArtifact revision, CancellationToken cancellationToken)
    {
        await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = _databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
        }.ToString());
        await connection.OpenAsync(cancellationToken);

        await using (var schema = connection.CreateCommand())
        {
            schema.CommandText = SqliteSchema.Create;
            await schema.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var bytes = System.Text.Encoding.UTF8.GetBytes(revision.Source);

        await using (var blob = connection.CreateCommand())
        {
            blob.Transaction = (SqliteTransaction)transaction;
            blob.CommandText = "INSERT OR IGNORE INTO package_blobs(digest, media_type, content) VALUES ($digest, 'text/javascript', $content);";
            blob.Parameters.AddWithValue("$digest", revision.RevisionDigest);
            blob.Parameters.Add("$content", SqliteType.Blob).Value = bytes;
            await blob.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var record = connection.CreateCommand())
        {
            record.Transaction = (SqliteTransaction)transaction;
            record.CommandText = """
                INSERT OR IGNORE INTO package_revisions(digest, package_id, manifest_json, source_digest, created_utc)
                VALUES ($digest, $package, $manifest, $source, $created);
                """;
            record.Parameters.AddWithValue("$digest", revision.RevisionDigest);
            record.Parameters.AddWithValue("$package", revision.PackageId);
            record.Parameters.AddWithValue("$manifest", revision.ManifestJson);
            record.Parameters.AddWithValue("$source", revision.RevisionDigest);
            record.Parameters.AddWithValue("$created", DateTimeOffset.UtcNow.ToString("O"));
            await record.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }
}
