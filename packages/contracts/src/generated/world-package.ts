export interface WorldPackage {
    assets:                  Asset[];
    entry:                   string;
    lineageParentPackageId?: null | string;
    name:                    string;
    packageId:               string;
    requestedCapabilities:   string[];
    stateSchemaVersion:      number;
}

export interface Asset {
    digest:    string;
    handle:    string;
    mediaType: string;
}
