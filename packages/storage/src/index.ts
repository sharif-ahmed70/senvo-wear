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
