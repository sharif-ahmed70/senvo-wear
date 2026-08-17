import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export type StorageMetadata = Record<string, string | number | boolean>;

export type UploadObjectInput = {
  body: Uint8Array | ReadableStream;
  contentType: string;
  key: string;
  metadata?: StorageMetadata;
};

export type StoredObject = {
  key: string;
  metadata?: StorageMetadata;
  url?: string;
};

export type SignedUrlOptions = {
  expiresInSeconds: number;
};

export type ObjectStorageProvider = {
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>;
  getUrl(key: string): Promise<string>;
  upload(input: UploadObjectInput): Promise<StoredObject>;
};

export const productImageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProductImageContentType = (typeof productImageContentTypes)[number];

const extensions: Record<ProductImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function productImageObjectKey(input: {
  assetId: string;
  contentType: ProductImageContentType;
  organizationId: string;
  productId: string;
}): string {
  const segment = /^[0-9a-f-]{36}$/iu;
  if (
    !segment.test(input.organizationId) ||
    !segment.test(input.productId) ||
    !segment.test(input.assetId)
  ) {
    throw new Error("Media storage identifiers are invalid.");
  }
  return `organizations/${input.organizationId}/products/${input.productId}/${input.assetId}.${extensions[input.contentType]}`;
}

export class InMemoryObjectStorageProvider implements ObjectStorageProvider {
  private readonly objects = new Map<
    string,
    { body: Uint8Array; contentType: string; metadata?: StorageMetadata }
  >();

  constructor(
    private readonly failures: { delete?: boolean; upload?: boolean } = {},
  ) {}

  delete(key: string): Promise<void> {
    if (this.failures.delete)
      return Promise.reject(new Error("Object deletion failed."));
    this.objects.delete(key);
    return Promise.resolve();
  }

  getSignedUrl(key: string): Promise<string> {
    return this.getUrl(key);
  }

  getUrl(key: string): Promise<string> {
    const object = this.objects.get(key);
    if (!object)
      return Promise.reject(new Error("Stored object was not found."));
    return Promise.resolve(
      `data:${object.contentType};base64,${Buffer.from(object.body).toString("base64")}`,
    );
  }

  upload(input: UploadObjectInput): Promise<StoredObject> {
    if (this.failures.upload)
      return Promise.reject(new Error("Object upload failed."));
    if (!(input.body instanceof Uint8Array)) {
      return Promise.reject(
        new Error("Streaming uploads are not supported by this adapter."),
      );
    }
    this.objects.set(input.key, {
      body: new Uint8Array(input.body),
      contentType: input.contentType,
      metadata: input.metadata,
    });
    return Promise.resolve({ key: input.key, metadata: input.metadata });
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  count(): number {
    return this.objects.size;
  }
}

export class LocalFileObjectStorageProvider implements ObjectStorageProvider {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.getUrl(key);
  }

  async getUrl(key: string): Promise<string> {
    const body = await readFile(this.pathFor(key));
    return `data:${contentTypeForKey(key)};base64,${body.toString("base64")}`;
  }

  async upload(input: UploadObjectInput): Promise<StoredObject> {
    if (!(input.body instanceof Uint8Array)) {
      throw new Error("Streaming uploads are not supported by this adapter.");
    }
    const path = this.pathFor(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body, { flag: "w" });
    return { key: input.key, metadata: input.metadata };
  }

  private pathFor(key: string): string {
    const path = resolve(this.root, ...key.split("/"));
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error("Storage key escapes the configured root.");
    }
    return path;
  }
}

function contentTypeForKey(key: string): ProductImageContentType {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  throw new Error("Stored object content type is unsupported.");
}
