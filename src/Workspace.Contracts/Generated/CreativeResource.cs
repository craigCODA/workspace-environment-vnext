namespace Workspace.Contracts.Generated
{
    using System.Collections.Generic;

    public partial class CreativeResource
    {
        public string? Color { get; set; }
        public string Id { get; set; }
        public Kind Kind { get; set; }
        public double[][]? Points { get; set; }
        public Dictionary<string, Attribute>? Attributes { get; set; }
        public long[]? Indices { get; set; }
        public double[]? Positions { get; set; }
        public string? FragmentShader { get; set; }
        public Dictionary<string, object>? Uniforms { get; set; }
        public string? VertexShader { get; set; }
        public string? AssetHandle { get; set; }
        public double? Intensity { get; set; }
        public LightType? LightType { get; set; }
        public double[]? Position { get; set; }
        public double? Size { get; set; }
        public string? GeometryId { get; set; }
        public string? MaterialId { get; set; }
        public double[][]? Transforms { get; set; }
        public string[]? Children { get; set; }
        public double[]? Rotation { get; set; }
        public double[]? Scale { get; set; }
        public Dictionary<string, object>? Patch { get; set; }
    }

    public partial class Attribute
    {
        public long ItemSize { get; set; }
        public double[] Values { get; set; }
    }

    public enum Kind { Curve, Group, IndexedGeometry, Instanced, Light, Line, Points, ShaderMaterial, Texture, Update };

    public enum LightType { Ambient, Directional, Point };
}
