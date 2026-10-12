import assert from "node:assert/strict"
import test, { describe } from "node:test"

import PlkProvider from "../core/providers/PlkProvider.mjs"
import TransitousProvider from "../core/providers/TransitousProvider.mjs"

describe("provider response headers", () => {
  test("PlkProvider keeps response headers on HTTP errors", async () => {
    const provider = new PlkProvider({ apiKey: "test-key" })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": "5" },
    })

    try {
      await assert.rejects(provider.apiGet("/test"), (error) => {
        assert.equal(error.statusCode, 429)
        assert.equal(error.response.headers.get("retry-after"), "5")
        return true
      })
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  test("TransitousProvider keeps response headers on HTTP errors", async () => {
    const provider = new TransitousProvider({ stationId: "test-stop" })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": "5" },
    })

    try {
      await assert.rejects(provider.fetchDepartures(), (error) => {
        assert.equal(error.statusCode, 429)
        assert.equal(error.response.headers.get("retry-after"), "5")
        return true
      })
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })
})
