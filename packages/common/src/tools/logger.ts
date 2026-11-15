/* eslint-disable no-console */
import { z } from "zod";

import { env } from "@repo/common/env/web.env";
import { isServerRuntime } from "@repo/common/utils/is-server-runtime";

import { maskSecrets } from "./mask-secrets";

enum LoggerLevel {
  error = "error",
  warn = "warn",
  info = "info",
  debug = "debug",
}

const loggerLevelHierarchy = [
  LoggerLevel.error,
  LoggerLevel.warn,
  LoggerLevel.info,
  LoggerLevel.debug,
];

const loggerLevelSchema = z.enum(LoggerLevel).catch(LoggerLevel.error);
// With SKIP_ENV_VALIDATION (tests, CI) the env holds the raw "true"/"false".
const loggerTraceSchema = z
  .union([
    z.boolean(),
    z.enum(["true", "false"]).transform((v) => v === "true"),
  ])
  .default(false);

class Logger {
  private loggerLevel: LoggerLevel;
  private trace: boolean;

  constructor() {
    this.loggerLevel = loggerLevelSchema.parse(env.NEXT_PUBLIC_LOGGER_LEVEL);
    this.trace = loggerTraceSchema.parse(env.NEXT_PUBLIC_LOGGER_TRACE);
  }

  public error(tags: string[], ...message: unknown[]) {
    this.log(LoggerLevel.error, tags, ...message);
  }

  public info(tags: string[], ...message: unknown[]) {
    this.log(LoggerLevel.info, tags, ...message);
  }

  public warn(tags: string[], ...message: unknown[]) {
    this.log(LoggerLevel.warn, tags, ...message);
  }

  public debug(tags: string[], ...message: unknown[]) {
    this.log(LoggerLevel.debug, tags, ...message);
  }

  private canLog(loggerLevel: LoggerLevel) {
    return (
      loggerLevelHierarchy.indexOf(this.loggerLevel) >=
      loggerLevelHierarchy.indexOf(loggerLevel)
    );
  }

  private log(loggerLevel: LoggerLevel, tags: string[], ...message: unknown[]) {
    if (!this.canLog(loggerLevel)) return;

    const masked = message.map((item) => maskSecrets(item));
    const content = this.trace
      ? [...masked, "\n", this.formatStackTrace()]
      : masked;

    if (isServerRuntime()) {
      const colors = {
        [LoggerLevel.error]: "\x1b[31m",
        [LoggerLevel.warn]: "\x1b[33m",
        [LoggerLevel.info]: "\x1b[34m",
        [LoggerLevel.debug]: "\x1b[35m",
      };
      const reset = "\x1b[0m";

      const color = colors[loggerLevel];

      console.log(
        `${color}${new Date().toISOString()} [${loggerLevel}] [${tags.join("] [")}]${reset}`,
        ...content
      );
    } else {
      console.log(
        `${new Date().toISOString()} [${loggerLevel}] [${tags.join("] [")}]`,
        ...content
      );
    }
  }

  private formatStackTrace(): string {
    const stack = new Error().stack;
    if (!stack) return "(no stack)";
    return stack.split("\n").slice(4).join("\n");
  }
}

export const logger = new Logger();
