"use client";

import type { PurchaseMemoContract } from "@senvo/contracts";
import { Camera, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

/** Longest side after resizing; a phone photo stays readable but small. */
const MAX_SIDE_PX = 1800;

/**
 * Resizes a photo in the browser and returns JPEG base64 (without the
 * data: prefix), so big phone pictures upload quickly and stay under 5 MB.
 */
export async function compressMemoImage(
  file: File,
): Promise<{ base64: string; contentType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return {
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    contentType: "image/jpeg",
  };
}

/** Shows and uploads the supplier's cash memo photo for one purchase. */
export function PurchaseMemo({ purchaseId }: { purchaseId: string }) {
  const [memo, setMemo] = useState<PurchaseMemoContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void client
      .getPurchaseMemo(purchaseId)
      .then((result) => {
        if (active) setMemo(result.data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [purchaseId]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("শুধু ছবি (JPG, PNG, WebP) দিন।");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const image = await compressMemoImage(file);
      const result = await client.uploadPurchaseMemo({
        contentBase64: image.base64,
        contentType: image.contentType,
        purchaseId,
      });
      setMemo(result.data);
      setMessage("ক্যাশ মেমোর ছবি সেভ হয়েছে।");
    } catch (caught) {
      setMessage(
        caught instanceof AdminApiError
          ? `${caught.message} (Request ${caught.requestId})`
          : "ছবি সেভ করা যায়নি। আবার চেষ্টা করুন।",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Supplier cash memo"
      style={{
        border: "1px solid #e5ded6",
        borderRadius: 10,
        display: "grid",
        gap: 10,
        margin: "16px 0",
        padding: 14,
      }}
    >
      <strong>সাপ্লায়ারের ক্যাশ মেমো (Cash memo)</strong>
      {loading ? (
        <span role="status">
          <LoaderCircle aria-hidden="true" size={16} /> লোড হচ্ছে…
        </span>
      ) : memo ? (
        <a href={memo.url} rel="noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
          <img
            alt="Supplier cash memo"
            src={memo.url}
            style={{
              border: "1px solid #ddd",
              borderRadius: 6,
              maxHeight: 360,
              maxWidth: "100%",
              objectFit: "contain",
            }}
          />
        </a>
      ) : (
        <span style={{ color: "#6f6560", fontSize: "0.85rem" }}>
          এখনো কোনো মেমোর ছবি যোগ করা হয়নি।
        </span>
      )}
      <label
        style={{
          alignItems: "center",
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex",
          gap: 6,
          justifySelf: "start",
        }}
      >
        <Camera aria-hidden="true" size={16} />
        {memo ? "মেমোর ছবি বদলান" : "মেমোর ছবি যোগ করুন"}
        <input
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
          style={{ marginLeft: 6 }}
          type="file"
        />
      </label>
      {busy ? (
        <span role="status">
          <LoaderCircle aria-hidden="true" size={16} /> সেভ হচ্ছে…
        </span>
      ) : null}
      {message ? <span role="status">{message}</span> : null}
    </section>
  );
}
