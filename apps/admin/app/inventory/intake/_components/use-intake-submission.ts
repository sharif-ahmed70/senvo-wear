"use client";

import type {
  CreateStockIntakeServiceInputContract,
  StockIntakeContract,
} from "@senvo/contracts";
import { useRef, useState } from "react";
import { AdminApiClient } from "../../../_lib/api-client";
import { createIdempotencyKey, keyAfterAttempt } from "../_lib/intake-draft";
import { intakeErrorMessage } from "../_lib/intake-support";

export const intakeClient = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

/**
 * Sends one stock intake per form. The idempotency key lives as long as the
 * form: retries after a failed or uncertain request reuse it, and only a
 * saved intake or a fresh form gets a new key.
 */
export function useIntakeSubmission() {
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StockIntakeContract | null>(null);
  const pending = useRef(false);

  async function submit(
    build: (key: string) => CreateStockIntakeServiceInputContract,
  ): Promise<StockIntakeContract | null> {
    if (pending.current) return null;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await intakeClient.createStockIntake(
        build(idempotencyKey),
      );
      setIdempotencyKey((key) => keyAfterAttempt(key, "saved"));
      setResult(response.data);
      return response.data;
    } catch (caught) {
      setIdempotencyKey((key) => keyAfterAttempt(key, "failed"));
      setError(intakeErrorMessage(caught));
      return null;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setError("");
    setIdempotencyKey(createIdempotencyKey());
  }

  return { error, idempotencyKey, reset, result, saving, setError, submit };
}
