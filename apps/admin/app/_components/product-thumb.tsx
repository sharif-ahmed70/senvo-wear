"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminApiClient } from "../_lib/api-client";
import styles from "./product-thumb.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const cache = new Map<string, Promise<string | null>>();

function fetchImage(productId: string): Promise<string | null> {
  if (!cache.has(productId)) {
    const promise = client
      .getPrimaryProductImage(productId)
      .then((res) => res.data.url)
      .catch(() => null);
    cache.set(productId, promise);
  }
  return cache.get(productId)!;
}

export function ProductThumb({
  productId,
  name,
  size = 40,
}: {
  productId: string;
  name: string;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    setUrl(null);
    void fetchImage(productId).then((result) => {
      if (active) {
        if (result) {
          setUrl(result);
        } else {
          setError(true);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [productId]);

  const style = { width: size, height: size };

  if (error) {
    return (
      <div className={styles.placeholder} style={style} title={name}>
        <ImageIcon size={Math.max(16, size * 0.5)} className={styles.icon} />
      </div>
    );
  }

  if (!url) {
    return <div className={styles.loading} style={style} title={name} />;
  }

  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      className={styles.image}
      style={style}
      onError={() => setError(true)}
    />
  );
}
