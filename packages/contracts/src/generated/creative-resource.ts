export interface CreativeResource {
    color?:          string;
    id:              string;
    kind:            Kind;
    points?:         [[number, number, number, ...number[]], [number, number, number, ...number[]], ...[number, number, number, ...number[]][]];
    attributes?:     { [key: string]: Attribute };
    indices?:        number[];
    positions?:      number[];
    fragmentShader?: string;
    uniforms?:       { [key: string]: unknown };
    vertexShader?:   string;
    assetHandle?:    string;
    intensity?:      number;
    lightType?:      LightType;
    position?:       [number, number, number, ...number[]];
    size?:           number;
    geometryId?:     string;
    materialId?:     string;
    transforms?:     Array<[number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, ...number[]]>;
    children?:       string[];
    rotation?:       [number, number, number, number, ...number[]];
    scale?:          [number, number, number, ...number[]];
    patch?:          { [key: string]: unknown };
}

export interface Attribute {
    itemSize: number;
    values:   number[];
}

export type Kind = "line" | "indexedGeometry" | "curve" | "shaderMaterial" | "texture" | "light" | "points" | "instanced" | "group" | "update";

export type LightType = "ambient" | "directional" | "point";
