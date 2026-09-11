namespace Workspace.Contracts.Generated
{

    public partial class WorldPackage
    {
        public Asset[] Assets { get; set; }
        public string Entry { get; set; }
        public string? LineageParentPackageId { get; set; }
        public string Name { get; set; }
        public string PackageId { get; set; }
        public string[] RequestedCapabilities { get; set; }
        public long StateSchemaVersion { get; set; }
    }

    public partial class Asset
    {
        public string Digest { get; set; }
        public string Handle { get; set; }
        public string MediaType { get; set; }
    }
}
