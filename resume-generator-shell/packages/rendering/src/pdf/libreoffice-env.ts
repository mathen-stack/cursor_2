/**
 * Minimal allow-list of environment variables safe to pass into LibreOffice.
 * Never forward API keys or other secrets into the converter process.
 */
export function createLibreOfficeEnv(
  workingDirectory: string,
  sourceEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const allowedKeys = [
    "PATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "TMPDIR",
    "TMP",
    "TEMP",
    "USER",
    "LOGNAME",
    "DISPLAY",
    "XDG_RUNTIME_DIR",
    "FONTCONFIG_PATH",
    "FONTCONFIG_FILE",
  ] as const;

  const env: NodeJS.ProcessEnv = {
    HOME: workingDirectory,
    NODE_ENV: sourceEnv.NODE_ENV ?? "production",
  };

  for (const key of allowedKeys) {
    const value = sourceEnv[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }

  return env;
}
