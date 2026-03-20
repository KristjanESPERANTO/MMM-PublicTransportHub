import assert from "node:assert/strict"
import test from "node:test"

import { loadNodeHelperModuleForTests } from "./test-helpers.mjs"

function withFetchError(message, extra = {}) {
  return {
    message,
    ...extra,
  }
}

test("fetchWithRetry retries timeout and network-like errors", async () => {
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

test("fetchWithRetry does not retry client-side 4xx errors", async () => {
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

test("fetchWithRetry retries for HTTP 429 and eventually succeeds", async () => {
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

test("fetchWithRetry retries for HTTP 5xx and eventually succeeds", async () => {
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

test("fetchDepartures emits NOT_INITIALIZED error code when provider is missing", async () => {
  const helper = loadNodeHelperModuleForTests()
  const sentNotifications = []

  helper.providers = new Map()
  helper.sendSocketNotification = (notification, payload) => {
    sentNotifications.push({ notification, payload })
  }

  await helper.fetchDepartures({
    identifier: "missing",
    provider: "transitous",
    stationId: "x",
  })

  assert.equal(sentNotifications.length, 1)
  assert.equal(sentNotifications[0].notification, "PTH_ERROR")
  assert.equal(sentNotifications[0].payload.error.code, "NOT_INITIALIZED")
})

test("fetchDepartures emits SERVER error code on HTTP 5xx failures", async () => {
  const helper = loadNodeHelperModuleForTests()
  const sentNotifications = []

  const provider = {
    config: {
      requestTimeoutMs: 12000,
      fetchRetries: 0,
      provider: "transitous",
      stationId: "x",
    },
    async fetchDepartures() {
      throw withFetchError("Service unavailable", { statusCode: 503 })
    },
  }

  helper.providers = new Map([["id-1", provider]])
  helper.sendSocketNotification = (notification, payload) => {
    sentNotifications.push({ notification, payload })
  }

  await helper.fetchDepartures({ identifier: "id-1" })

  assert.equal(sentNotifications.length, 1)
  assert.equal(sentNotifications[0].notification, "PTH_ERROR")
  assert.equal(sentNotifications[0].payload.error.code, "SERVER")
})
