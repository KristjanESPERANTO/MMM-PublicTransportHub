import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { loadNodeHelperModuleForTests, withFetchError } from "./test-helpers.mjs"

async function runWithMockTimers(t, callback, now) {
  t.mock.timers.enable({
    apis: ["Date", "setTimeout"],
    ...(now == null ? {} : { now }),
  })

  let outcome
  callback().then(
    (value) => { outcome = { value } },
    (error) => { outcome = { error } },
  )

  for (let attempt = 0; attempt < 100 && !outcome; attempt += 1) {
    for (let microtask = 0; microtask < 10; microtask += 1) {
      await Promise.resolve()
    }
    t.mock.timers.runAll()
  }

  assert.ok(outcome, "retry operation did not settle with mocked timers")
  if ("error" in outcome) {
    throw outcome.error
  }

  return outcome.value
}

describe("fetchWithRetry", () => {
  test("applies the upper jitter bound", async (t) => {
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
      const result = await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
        timeoutMs: 12000,
        retries: 1,
        context: "[test]",
      }))

      assert.equal(result.length, 1)
      assert.match(warnings[0], /retrying in 720ms/u)
    }
    finally {
      Math.random = originalRandom
    }
  })

  test("applies the lower jitter bound", async (t) => {
    const originalRandom = Math.random
    Math.random = () => 0
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
      await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
        timeoutMs: 12000,
        retries: 1,
        context: "[test]",
      }))

      assert.match(warnings[0], /retrying in 480ms/u)
    }
    finally {
      Math.random = originalRandom
    }
  })

  test("caps jittered backoff at 3000ms", async (t) => {
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
        if (this.attempts <= 5) {
          throw withFetchError("Service unavailable", { statusCode: 503 })
        }

        return [{ id: 1 }]
      },
    }

    try {
      await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
        timeoutMs: 12000,
        retries: 5,
        context: "[test]",
      }))

      assert.equal(provider.attempts, 6)
      assert.match(warnings.at(-1), /retrying in 3000ms/u)
    }
    finally {
      Math.random = originalRandom
    }
  })

  test("retries timeout and network-like errors", async (t) => {
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

    const result = await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    }))

    assert.equal(result.length, 1)
    assert.equal(provider.attempts, 3)
  })

  test("retries on premature stream close errors", async (t) => {
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

    const result = await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    }))

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

  test("stops after all retry attempts are exhausted", async (t) => {
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
        throw withFetchError("Service unavailable", { statusCode: 503 })
      },
    }

    await assert.rejects(
      runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
        timeoutMs: 12000,
        retries: 2,
        context: "[test]",
      })),
      error => error.message === "Service unavailable",
    )

    assert.equal(provider.attempts, 3)
    assert.equal(warnings.length, 2)
  })

  test("retries for HTTP 429 and eventually succeeds", async (t) => {
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

    const result = await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    }))

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
    test(`honors Retry-After as ${testCase.name}`, async (t) => {
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
      const originalRandom = Math.random
      Math.random = () => 0.5

      try {
        const result = await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
          timeoutMs: 12000,
          retries: 1,
          context: "[test]",
        }), testCase.now)

        assert.equal(result.length, 1)
        assert.equal(provider.attempts, 2)
        assert.ok(
          warnings[0].includes(`retrying in ${testCase.expectedDelay}ms`),
          warnings[0],
        )
      }
      finally {
        Math.random = originalRandom
      }
    })
  }

  test("retries for HTTP 5xx and eventually succeeds", async (t) => {
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

    const result = await runWithMockTimers(t, () => helper.fetchWithRetry(provider, {
      timeoutMs: 12000,
      retries: 2,
      context: "[test]",
    }))

    assert.equal(result.length, 1)
    assert.equal(provider.attempts, 2)
  })
})
