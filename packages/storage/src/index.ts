import { createHash, createHmac } from "node:crypto";
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

export type S3CompatibleStorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
};

export function loadS3CompatibleStorageConfig(
  environment: Record<string, string | undefined>,
): S3CompatibleStorageConfig {
  const config = {
    accessKeyId: environment.MEDIA_S3_ACCESS_KEY_ID?.trim() ?? "",
    bucket: environment.MEDIA_S3_BUCKET?.trim() ?? "",
    endpoint: normalizedHttps(
      environment.MEDIA_S3_ENDPOINT,
      "MEDIA_S3_ENDPOINT",
    ),
    publicBaseUrl: normalizedHttps(
      environment.MEDIA_PUBLIC_BASE_URL,
      "MEDIA_PUBLIC_BASE_URL",
    ),
    region: environment.MEDIA_S3_REGION?.trim() || "auto",
    secretAccessKey: environment.MEDIA_S3_SECRET_ACCESS_KEY?.trim() ?? "",
  };
  if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error(
      "MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, and MEDIA_S3_SECRET_ACCESS_KEY are required.",
    );
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(config.bucket)) {
    throw new Error("MEDIA_S3_BUCKET is invalid.");
  }
  return config;
}

export class S3CompatibleObjectStorageProvider implements ObjectStorageProvider {
  constructor(
    private readonly config: S3CompatibleStorageConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async delete(key: string): Promise<void> {
    await this.request("DELETE", key, new Uint8Array(), "");
  }

  getSignedUrl(key: string): Promise<string> {
    return this.getUrl(key);
  }

  getUrl(key: string): Promise<string> {
    return Promise.resolve(
      `${this.config.publicBaseUrl}/${encodeStorageKey(key)}`,
    );
  }

  async upload(input: UploadObjectInput): Promise<StoredObject> {
    if (!(input.body instanceof Uint8Array)) {
      throw new Error("Streaming uploads are not supported by this adapter.");
    }
    await this.request("PUT", input.key, input.body, input.contentType);
    return {
      key: input.key,
      metadata: input.metadata,
      url: await this.getUrl(input.key),
    };
  }

  private async request(
    method: "DELETE" | "PUT",
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const now = this.clock();
    const date = amzDate(now);
    const day = date.slice(0, 8);
    const endpoint = new URL(this.config.endpoint);
    const canonicalUri = `/${encodeURIComponent(this.config.bucket)}/${encodeStorageKey(key)}`;
    const payloadHash = sha256(body);
    const canonicalHeaders = `host:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${day}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      date,
      scope,
      sha256(canonicalRequest),
    ].join("\n");
    const signature = hmac(
      signingKey(this.config.secretAccessKey, day, this.config.region),
      stringToSign,
    ).toString("hex");
    const response = await this.fetcher(
      new URL(canonicalUri, endpoint).toString(),
      {
        body: method === "PUT" ? Buffer.from(body) : undefined,
        headers: {
          authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
          ...(contentType ? { "content-type": contentType } : {}),
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": date,
        },
        method,
      },
    );
    if (!response.ok) {
      throw new Error(
        `Object storage request failed with status ${response.status}.`,
      );
    }
  }
}

function signingKey(secret: string, day: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function amzDate(value: Date): string {
  return value.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}

function encodeStorageKey(key: string): string {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Storage key is invalid.");
  }
  return key.split("/").map(encodeURIComponent).join("/");
}

function normalizedHttps(value: string | undefined, name: string): string {
  const text = value?.trim().replace(/\/$/u, "") ?? "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS.`);
  }
  return text;
}

function contentTypeForKey(key: string): ProductImageContentType {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  throw new Error("Stored object content type is unsupported.");
}
