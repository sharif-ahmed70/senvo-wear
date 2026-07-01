export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

export type LogContext = {
  correlationId?: string;
  requestId?: string;
};

export type Logger = {
  debug(message: string, metadata?: LogMetadata, context?: LogContext): void;
  info(message: string, metadata?: LogMetadata, context?: LogContext): void;
  warn(message: string, metadata?: LogMetadata, context?: LogContext): void;
  error(message: string, metadata?: LogMetadata, context?: LogContext): void;
};

export function createConsoleLogger(scope: string): Logger {
  const write = (
    level: LogLevel,
    message: string,
    metadata?: LogMetadata,
    context?: LogContext,
  ) => {
    const entry = {
      context,
      level,
      message,
      metadata,
      scope,
      timestamp: new Date().toISOString(),
    };

    const output = JSON.stringify(entry);
    if (level === "error") {
      console.error(output);
      return;
    }
    if (level === "warn") {
      console.warn(output);
      return;
    }
    console.log(output);
  };

  return {
    debug: (message, metadata, context) =>
      write("debug", message, metadata, context),
    error: (message, metadata, context) =>
      write("error", message, metadata, context),
    info: (message, metadata, context) =>
      write("info", message, metadata, context),
    warn: (message, metadata, context) =>
      write("warn", message, metadata, context),
  };
}
