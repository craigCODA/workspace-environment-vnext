namespace Workspace.Storage.Sqlite;

internal static class SqliteSchema
{
    public const string Create = """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS world_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          world_revision INTEGER NOT NULL,
          document_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS explicit_checkpoints (
          id TEXT PRIMARY KEY,
          world_revision INTEGER NOT NULL,
          created_utc TEXT NOT NULL,
          document_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS package_blobs (
          digest TEXT PRIMARY KEY,
          media_type TEXT NOT NULL,
          content BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS package_revisions (
          digest TEXT PRIMARY KEY,
          package_id TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          source_digest TEXT NOT NULL,
          created_utc TEXT NOT NULL
        );
        """;
}
