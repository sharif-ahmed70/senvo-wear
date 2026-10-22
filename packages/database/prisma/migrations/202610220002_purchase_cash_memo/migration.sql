-- Optional photo of the supplier's cash memo for a purchase. The image itself
-- lives in object storage; only its key and type are stored here.
ALTER TABLE "purchases"
  ADD COLUMN "memo_storage_key" VARCHAR(500),
  ADD COLUMN "memo_content_type" VARCHAR(100),
  ADD COLUMN "memo_uploaded_at" TIMESTAMPTZ(6);
