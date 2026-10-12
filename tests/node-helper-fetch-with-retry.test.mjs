import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { loadNodeHelperModuleForTests, withFetchError } from "./test-helpers.mjs"

describe("fetchWithRetry", () => {
  test("adds jitter to retry delays", async () => {
    const originalRandom = Math.random
    Math.random = () => 0.999
    const warnings = []
    const helper = loadNodeHelperModuleForTests({
      warn(message) {
        warnings.push(message)
      },
    })
    const provider = {
      attempts: 0,
      async fetchDepartures() {
        this.attempts += 1
        if (this.attempts === 1) {
          throw withFetchError("Service unavailable", { statusCode: 503 })
        }

        return [{ id: 1 }]
      },
    }

    try {
      const result = await helper.fetchWithRetry(provider, {
        timeoutMs: 12000,
        retries: 1,
        context: "[test]",
      })

      assert.equal(result.length, 1)
      assert.match(warnings[0], /retrying in 720ms/u)
    }
    finally {
      Math.random = originalRandom
    }
  })

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

  for (const testCase of [
    {
      name: "delta-seconds",
      value: "5",
      expectedDelay: 5000,
    },
    {
      name: "HTTP date",
      value: "Mon, 12 Oct 2026 12:00:30 GMT",
      now: Date.parse("2026-10-12T12:00:00Z"),
      expectedDelay: 30000,
    },
  ]) {
    test(`honors Retry-After as ${testCase.name}`, async () => {
      const warnings = []
      const helper = loadNodeHelperModuleForTests({
        warn(message) {
          warnings.push(message)
        },
      })
      const provider = {
        attempts: 0,
        async fetchDepartures() {
          this.attempts += 1
          if (this.attempts === 1) {
            throw withFetchError("Too many requests", {
              response: {
                status: 429,
                headers: new Headers({ "Retry-After": testCase.value }),
              },
            })
          }

          return [{ id: 4 }]
        },
      }
      const originalNow = Date.now
      const originalSetTimeout = globalThis.setTimeout
      const originalRandom = Math.random
      let fakeNow = testCase.now ?? originalNow()
      Date.now = () => fakeNow
      Math.random = () => 0.5
      globalThis.setTimeout = (callback, delay, ...args) => {
        if (delay === 12000) {
          return originalSetTimeout(callback, delay, ...args)
        }

        fakeNow += delay
        return originalSetTimeout(callback, 0, ...args)
      }

      try {
        const result = await helper.fetchWithRetry(provider, {
          timeoutMs: 12000,
          retries: 1,
          context: "[test]",
        })

        assert.equal(result.length, 1)
        assert.equal(provider.attempts, 2)
        assert.ok(warnings[0].includes(`retrying in ${testCase.expectedDelay}ms`))
      }
      finally {
        Date.now = originalNow
        Math.random = originalRandom
        globalThis.setTimeout = originalSetTimeout
      }
    })
  }

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
