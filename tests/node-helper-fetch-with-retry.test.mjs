import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { loadNodeHelperModuleForTests, withFetchError } from "./test-helpers.mjs"

describe("fetchWithRetry", () => {
  test("retries timeout and network-like errors", async () => {
    const helper = loadNodeHelperModuleForTests()

    const provider = {
      attempts: 0,
      async fetchDepartures() {
        this.attempts += 1
        if (this.attempts < 3) {
          throw withFetchError("Fetch timed out after 12000ms")
        }

        return [{ id: 1 }]
      },
    }

    const result = await helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    })

    assert.equal(result.length, 1)
    assert.equal(provider.attempts, 3)
  })

  test("retries on premature stream close errors", async () => {
    const helper = loadNodeHelperModuleForTests()

    const provider = {
      attempts: 0,
      async fetchDepartures() {
        this.attempts += 1
        if (this.attempts === 1) {
          throw withFetchError(
            "Invalid response body while trying to fetch endpoint: Premature close",
            { code: "ERR_STREAM_PREMATURE_CLOSE" },
          )
        }

        return [{ id: 99 }]
      },
    }

    const result = await helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    })

    assert.equal(result.length, 1)
    assert.equal(provider.attempts, 2)
  })

  test("does not retry client-side 4xx errors", async () => {
    const helper = loadNodeHelperModuleForTests()

    const provider = {
      attempts: 0,
      async fetchDepartures() {
        this.attempts += 1
        throw withFetchError("Bad request", { statusCode: 400 })
      },
    }

    await assert.rejects(
      helper.fetchWithRetry(provider, {
        timeoutMs: 12000,
        retries: 3,
        context: "[test]",
      }),
    )

    assert.equal(provider.attempts, 1)
  })

  test("retries for HTTP 429 and eventually succeeds", async () => {
    const helper = loadNodeHelperModuleForTests()

    const provider = {
      attempts: 0,
      async fetchDepartures() {
        this.attempts += 1
        if (this.attempts === 1) {
          throw withFetchError("Too many requests", { status: 429 })
        }

        return [{ id: 2 }]
      },
    }

    const result = await helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    })

    assert.equal(result.length, 1)
    assert.equal(provider.attempts, 2)
  })

  test("retries for HTTP 5xx and eventually succeeds", async () => {
    const helper = loadNodeHelperModuleForTests()

    const provider = {
      attempts: 0,
      async fetchDepartures() {
        this.attempts += 1
        if (this.attempts === 1) {
          throw withFetchError("Service unavailable", { statusCode: 503 })
        }

        return [{ id: 3 }]
      },
    }

    const result = await helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    })

    assert.equal(result.length, 1)
    assert.equal(provider.attempts, 2)
  })
})
