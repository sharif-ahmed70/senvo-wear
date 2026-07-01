# Storage Package

`@senvo/storage` defines a provider-neutral boundary for future S3/R2-style object storage. It does not connect to any real cloud provider and must not contain credentials.

Validation, content-type policy, size limits, malware scanning, and signed URL rules should be defined before production use.
