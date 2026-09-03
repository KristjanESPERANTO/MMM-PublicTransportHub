import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { createProvider } from "../core/ProviderFactory.mjs"

describe("ProviderFactory", () => {
  test("rejects unknown providers", async () => {
    await assert.rejects(
      createProvider({ provider: "unknown" }),
      /Unknown provider: "unknown".*Supported providers:/,
    )
  })
})
