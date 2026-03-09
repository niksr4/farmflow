declare module "@next/env" {
  type LoadEnvConfigOptions = {
    dev?: boolean
    forceReload?: boolean
    silent?: boolean
  }

  export function loadEnvConfig(
    dir: string,
    dev?: boolean,
    log?: { info?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void },
    forceReload?: boolean,
    onReload?: (envFilePath: string) => void,
  ): {
    combinedEnv: Record<string, string>
    parsedEnv: Record<string, string>
    loadedEnvFiles: Array<{ path: string; contents: string; env: Record<string, string> }>
  }

  export function updateInitialEnv(newEnv: Record<string, string>): void
  export function processEnv(loadedEnvFiles: string[], dir?: string, options?: LoadEnvConfigOptions): void
}
