export class CancellationError extends Error {
  constructor(message = "Operation cancelled by user.") {
    super(message);
    this.name = "CancellationError";
  }
}

export class MismatchError extends Error {
  constructor(message = "Password confirmation does not match.") {
    super(message);
    this.name = "MismatchError";
  }
}

export class OverlengthError extends Error {
  constructor(message = "Password exceeds maximum length.") {
    super(message);
    this.name = "OverlengthError";
  }
}

export async function readHiddenLine({
  stdin = process.stdin,
  stdout = process.stdout,
  prompt = "",
  maxLength = 128,
} = {}) {
  return new Promise((resolve, reject) => {
    let input = "";
    const isRawSupported = Boolean(
      stdin.isTTY && typeof stdin.setRawMode === "function",
    );
    const wasRaw = Boolean(stdin.isRaw);

    if (stdout && prompt) {
      stdout.write(prompt);
    }

    if (isRawSupported) {
      stdin.setRawMode(true);
      stdin.resume();
    }

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      stdin.removeListener("data", onData);
      stdin.removeListener("error", onError);
      stdin.removeListener("end", onEnd);
      stdin.removeListener("close", onClose);
      if (isRawSupported) {
        stdin.setRawMode(wasRaw);
      }
    };

    const onError = (err) => {
      cleanup();
      if (stdout) stdout.write("\n");
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onEnd = () => {
      cleanup();
      if (stdout) stdout.write("\n");
      reject(new CancellationError("Stream ended before input completed."));
    };

    const onClose = () => {
      cleanup();
      if (stdout) stdout.write("\n");
      reject(new CancellationError("Stream closed before input completed."));
    };

    const onData = (chunk) => {
      const str = chunk.toString("utf8");
      for (const char of str) {
        if (char === "\u0003" || char === "\u001b") {
          cleanup();
          if (stdout) stdout.write("\n");
          return reject(new CancellationError());
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          if (stdout) stdout.write("\n");
          return resolve(input);
        }

        if (char === "\b" || char === "\u007f") {
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
          continue;
        }

        if (input.length >= maxLength) {
          cleanup();
          if (stdout) stdout.write("\n");
          return reject(new OverlengthError());
        }

        input += char;
      }
    };

    stdin.on("data", onData);
    stdin.on("error", onError);
    stdin.on("end", onEnd);
    stdin.on("close", onClose);
  });
}

export async function collectHiddenPassword({
  stdin = process.stdin,
  stdout = process.stdout,
  prompt = "Enter new password: ",
  confirmPrompt = "Confirm new password: ",
  maxLength = 128,
  minLength = 8,
} = {}) {
  const password = await readHiddenLine({
    stdin,
    stdout,
    prompt,
    maxLength,
  });

  if (password.length < minLength) {
    throw new Error(`Password must be at least ${minLength} characters.`);
  }

  const confirmation = await readHiddenLine({
    stdin,
    stdout,
    prompt: confirmPrompt,
    maxLength,
  });

  if (password !== confirmation) {
    throw new MismatchError();
  }

  return password;
}
