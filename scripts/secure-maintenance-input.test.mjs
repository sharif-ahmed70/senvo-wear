import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  collectHiddenPassword,
  readHiddenLine,
  CancellationError,
  MismatchError,
  OverlengthError,
} from "./secure-maintenance-input.mjs";

class FakeStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  setRawMode(mode) {
    this.isRaw = mode;
  }
  resume() {}
  emitKey(key) {
    this.emit("data", Buffer.from(key));
  }
}
function harness() {
  const stdin = new FakeStdin();
  const stdout = {
    output: "",
    write(text) {
      this.output += text;
      return true;
    },
  };
  return { stdin, stdout };
}
function assertCleanup(stdin, raw = false) {
  assert.equal(stdin.isRaw, raw);
  for (const event of ["data", "error", "end", "close"])
    assert.equal(stdin.listenerCount(event), 0);
}

test("hidden input supports backspace without echo and cleans up", async () => {
  const { stdin, stdout } = harness();
  const line = readHiddenLine({ stdin, stdout, prompt: "Password: " });
  stdin.emitKey("secret123\b!\r");
  assert.equal(await line, "secret12!");
  assert.equal(stdout.output, "Password: \n");
  assertCleanup(stdin);
});

test("128 characters and matching confirmation are accepted", async () => {
  const { stdin, stdout } = harness();
  const password = "x".repeat(128);
  const result = collectHiddenPassword({ stdin, stdout });
  stdin.emitKey(password + "\n");
  await new Promise((resolve) => setImmediate(resolve));
  stdin.emitKey(password + "\n");
  assert.equal(await result, password);
  assert.equal(stdout.output.includes(password), false);
  assertCleanup(stdin);
});

test("129 characters are rejected and terminal state restored", async () => {
  const { stdin, stdout } = harness();
  const line = readHiddenLine({ stdin, stdout });
  stdin.emitKey("x".repeat(129));
  await assert.rejects(line, OverlengthError);
  assertCleanup(stdin);
});

test("confirmation mismatch is rejected and cleaned up", async () => {
  const { stdin, stdout } = harness();
  const result = collectHiddenPassword({ stdin, stdout });
  stdin.emitKey("Password123!\n");
  await new Promise((resolve) => setImmediate(resolve));
  stdin.emitKey("Different123!\n");
  await assert.rejects(result, MismatchError);
  assertCleanup(stdin);
});

test("cancellation by Ctrl+C or Escape restores prior raw state", async () => {
  for (const key of ["\u0003", "\u001b"]) {
    const { stdin, stdout } = harness();
    stdin.isRaw = true;
    const line = readHiddenLine({ stdin, stdout });
    stdin.emitKey("partial" + key);
    await assert.rejects(line, CancellationError);
    assertCleanup(stdin, true);
  }
});

test("stream error, end, and close reject and restore terminal/listeners", async () => {
  for (const event of ["error", "end", "close"]) {
    const { stdin, stdout } = harness();
    const line = readHiddenLine({ stdin, stdout });
    stdin.emit(event, new Error("SYNTHETIC_STREAM_ERROR"));
    await assert.rejects(line);
    assertCleanup(stdin);
  }
});
