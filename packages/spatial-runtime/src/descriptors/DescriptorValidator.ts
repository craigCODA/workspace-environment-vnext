import AjvRuntime from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import schema from '../../../../contracts/schemas/creative-resource.schema.json' with { type: 'json' };
import type { CreativeResourceDescriptor, CreativeResourceUpdate } from '@workspace/creative-sdk';

type AjvInstance = {
  compile(schema: object): ValidateFunction;
};

type AjvConstructor = new (options?: { allErrors?: boolean; strict?: boolean }) => AjvInstance;
const Ajv = AjvRuntime as unknown as AjvConstructor;
const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = ajv.compile(schema as object);
const assetPattern = /^asset:sha256:[0-9a-f]{64}$/;

export interface ValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly errors?: readonly string[];
}

export function validateDescriptor(value: unknown): ValidationResult<CreativeResourceDescriptor | CreativeResourceUpdate> {
  if (!compiled(value)) {
    return {
      ok: false,
      errors: (compiled.errors ?? []).map((error: ErrorObject) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`),
    };
  }

  if (typeof value === 'object' && value !== null && 'kind' in value && (value as { kind?: unknown }).kind === 'texture') {
    const assetHandle = (value as { assetHandle?: unknown }).assetHandle;
    if (typeof assetHandle !== 'string' || !assetPattern.test(assetHandle)) {
      return { ok: false, errors: ['texture.assetHandle must be a host asset handle'] };
    }
  }

  return { ok: true, value: value as CreativeResourceDescriptor | CreativeResourceUpdate };
}
