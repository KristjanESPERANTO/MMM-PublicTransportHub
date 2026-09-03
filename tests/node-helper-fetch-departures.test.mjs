import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { loadNodeHelperModuleForTests, withFetchError } from "./test-helpers.mjs"

describe("fetchDepartures", () => {
  test("emits NOT_INITIALIZED error code when provider is missing", async () => {
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

  test("emits SERVER error code on HTTP 5xx failures", async () => {
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
})
