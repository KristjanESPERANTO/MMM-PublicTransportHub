import assert from "node:assert/strict"
import test from "node:test"

import { createProvider } from "../core/ProviderFactory.mjs"
import HafasProvider from "../core/providers/HafasProvider.mjs"
import VendoProvider from "../core/providers/VendoProvider.mjs"

test("ProviderFactory rejects unknown providers", async () => {
  await assert.rejects(
    createProvider({ provider: "unknown" }),
    /Unknown provider: "unknown".*Supported providers:/,
  )
})

test("HafasProvider initClient keeps original error as cause", async () => {
  const provider = new HafasProvider({
    hafasProfile: "__invalid_profile_for_test__",
  })

  await assert.rejects(
    provider.initClient(),
    (error) => {
      assert.match(error.message, /Could not load HAFAS profile/)
      assert.ok(error.cause)
      return true
    },
  )
})

test("VendoProvider initClient keeps original error as cause", async () => {
  const provider = new VendoProvider({
    vendoProfile: "__invalid_profile_for_test__",
  })

  await assert.rejects(
    provider.initClient(),
    (error) => {
      assert.match(error.message, /Could not load Vendo profile/)
      assert.ok(error.cause)
      return true
    },
  )
})
