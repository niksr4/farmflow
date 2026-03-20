import { assertCoreRuntimeConfig } from "@/lib/runtime-config"

export async function register() {
  assertCoreRuntimeConfig()
}
