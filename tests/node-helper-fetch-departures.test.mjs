import assert from "node:assert/strict"
import test, { describe } from "node:test"

import PlkProvider from "../core/providers/PlkProvider.mjs"
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

  test("classifies HTTP 403/452 as DB_BLOCKED only for DB profiles", async () => {
    for (const testCase of [
      {
        provider: "vendo",
        vendoProfile: "db",
        statusCode: 452,
        expectedCode: "DB_BLOCKED",
      },
      {
        provider: "vendo",
        vendoProfile: "dbweb",
        statusCode: 403,
        expectedCode: "DB_BLOCKED",
      },
      {
        provider: "hafas",
        hafasProfile: "dbweb",
        statusCode: 452,
        expectedCode: "DB_BLOCKED",
      },
      {
        provider: "vendo",
        vendoProfile: "oebb",
        statusCode: 403,
        expectedCode: "AUTH",
      },
      {
        provider: "transitous",
        statusCode: 452,
        expectedCode: "CLIENT",
      },
    ]) {
      const { statusCode, expectedCode, ...providerConfig } = testCase
      const helper = loadNodeHelperModuleForTests()
      const sentNotifications = []
      let attempts = 0
      const provider = {
        config: {
          requestTimeoutMs: 12000,
          fetchRetries: 2,
          stationId: "x",
          ...providerConfig,
        },
        async fetchDepartures() {
          attempts += 1
          throw withFetchError("Request rejected", { statusCode })
        },
      }

      helper.providers = new Map([["id-1", provider]])
      helper.sendSocketNotification = (notification, payload) => {
        sentNotifications.push({ notification, payload })
      }

      await helper.fetchDepartures({ identifier: "id-1" })

      assert.equal(sentNotifications[0].payload.error.code, expectedCode)
      assert.equal(attempts, 1)
    }
  })

  test("classifies unknown stations as NOT_FOUND without retrying", async () => {
    for (const failure of [
      { provider: "hafas", error: withFetchError("LOCATION: location/stop not found", { code: "NOT_FOUND" }) },
      { provider: "transitous", error: { error: "unknown feed id \"\"" } },
      { provider: "transitous", error: { error: "no radius: stop_found=false, center_parsed=false" } },
      { provider: "plk", error: withFetchError("Not found", { statusCode: 404 }) },
    ]) {
      const helper = loadNodeHelperModuleForTests()
      const sentNotifications = []
      let attempts = 0
      const provider = {
        config: {
          requestTimeoutMs: 12000,
          fetchRetries: 2,
          provider: failure.provider,
          stationId: "x",
        },
        async fetchDepartures() {
          attempts += 1
          throw failure.error
        },
      }

      helper.providers = new Map([["id-1", provider]])
      helper.sendSocketNotification = (notification, payload) => {
        sentNotifications.push({ notification, payload })
      }

      await helper.fetchDepartures({ identifier: "id-1" })

      assert.equal(sentNotifications[0].payload.error.code, "NOT_FOUND")
      assert.equal(attempts, 1)
    }
  })

  test("logs expected failures as one line and unexpected ones with the error", async () => {
    const authError = Object.assign(
      new Error("PLK API request to /api/v1/operations failed with status 401: Invalid API key."),
      { statusCode: 401 },
    )
    const unexpectedError = new TypeError("Cannot read properties of undefined")

    const logged = []
    for (const error of [authError, unexpectedError]) {
      const helper = loadNodeHelperModuleForTests({
        error: (...args) => logged.push(args),
      })
      helper.providers = new Map([["id-1", {
        config: { fetchRetries: 0, provider: "plk", stationId: "1" },
        async fetchDepartures() {
          throw error
        },
      }]])
      helper.sendSocketNotification = () => {}

      await helper.fetchDepartures({ identifier: "id-1" })
    }

    assert.equal(logged[0].length, 1)
    assert.match(logged[0][0], /Fetch failed .*\(AUTH\): PLK API request .*401/)
    assert.equal(logged[1].length, 2)
    assert.equal(logged[1][1], unexpectedError)
  })

  test("reports a missing PLK apiKey as AUTH without a network request", async () => {
    const originalFetch = globalThis.fetch
    let requests = 0
    globalThis.fetch = () => {
      requests += 1
      throw new Error("unexpected request")
    }

    try {
      const helper = loadNodeHelperModuleForTests()
      const sentNotifications = []
      helper.providers = new Map([["id-1", new PlkProvider({
        provider: "plk",
        stationId: "33605",
        apiKey: "  ",
        fetchRetries: 0,
      })]])
      helper.sendSocketNotification = (notification, payload) => {
        sentNotifications.push({ notification, payload })
      }

      await helper.fetchDepartures({ identifier: "id-1" })

      assert.equal(sentNotifications[0].payload.error.code, "AUTH")
      assert.match(sentNotifications[0].payload.error.message, /requires an apiKey/)
      assert.equal(requests, 0)
    }
    finally {
      globalThis.fetch = originalFetch
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
