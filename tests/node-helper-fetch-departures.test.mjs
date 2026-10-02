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

  test("classifies HTTP 452 as DB_BLOCKED only for DB profiles", async () => {
    for (const testCase of [
      {
        provider: "vendo",
        vendoProfile: "db",
        expectedCode: "DB_BLOCKED",
      },
      {
        provider: "hafas",
        hafasProfile: "dbweb",
        expectedCode: "DB_BLOCKED",
      },
      {
        provider: "transitous",
        expectedCode: "CLIENT",
      },
    ]) {
      const helper = loadNodeHelperModuleForTests()
      const sentNotifications = []
      let attempts = 0
      const provider = {
        config: {
          requestTimeoutMs: 12000,
          fetchRetries: 2,
          stationId: "x",
          ...testCase,
        },
        async fetchDepartures() {
          attempts += 1
          throw withFetchError("DB endpoint blocked", { statusCode: 452 })
        },
      }

      helper.providers = new Map([["id-1", provider]])
      helper.sendSocketNotification = (notification, payload) => {
        sentNotifications.push({ notification, payload })
      }

      await helper.fetchDepartures({ identifier: "id-1" })

      assert.equal(sentNotifications[0].payload.error.code, testCase.expectedCode)
      assert.equal(attempts, 1)
    }
  })

  test("passes normalized alert departures to the detector", async () => {
    const helper = loadNodeHelperModuleForTests()
    const sentNotifications = []
    const alertDepartures = [{ tripId: "cancelled-trip", canceled: true }]
    const detectorCalls = []
    const provider = {
      config: {
        requestTimeoutMs: 12000,
        fetchRetries: 0,
        provider: "transitous",
        stationId: "x",
      },
      serviceAlertDepartures: alertDepartures,
      async fetchDepartures() {
        return []
      },
    }

    helper.providers = new Map([["id-1", provider]])
    helper.serviceAlertDetectors = new Map([[
      "id-1",
      {
        process(departures) {
          detectorCalls.push(departures)
        },
      },
    ]])
    helper.sendSocketNotification = (notification, payload) => {
      sentNotifications.push({ notification, payload })
    }

    await helper.fetchDepartures({ identifier: "id-1" })

    assert.deepEqual(detectorCalls, [alertDepartures])
    assert.equal(sentNotifications[0].notification, "PTH_DEPARTURES")
  })

  test("ignores results from older overlapping requests", async () => {
    const helper = loadNodeHelperModuleForTests()
    const sentNotifications = []
    let resolveFirst
    let resolveSecond
    let callCount = 0
    const provider = {
      config: {
        requestTimeoutMs: 12000,
        fetchRetries: 0,
        provider: "transitous",
        stationId: "x",
      },
      fetchDepartures() {
        callCount += 1
        return new Promise((resolve) => {
          if (callCount === 1) {
            resolveFirst = resolve
          }
          else {
            resolveSecond = resolve
          }
        })
      },
    }

    helper.providers = new Map([["id-1", provider]])
    helper.sendSocketNotification = (notification, payload) => {
      sentNotifications.push({ notification, payload })
    }

    const firstRequest = helper.fetchDepartures({ identifier: "id-1" })
    const secondRequest = helper.fetchDepartures({ identifier: "id-1" })

    resolveSecond([{ tripId: "new" }])
    await secondRequest
    resolveFirst([{ tripId: "old" }])
    await firstRequest

    assert.deepEqual(sentNotifications, [{
      notification: "PTH_DEPARTURES",
      payload: {
        identifier: "id-1",
        departures: [{ tripId: "new" }],
      },
    }])
  })
})
