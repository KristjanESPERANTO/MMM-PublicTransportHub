import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { loadModuleDefinition } from "./test-helpers.mjs"

describe("toUserFacingError", () => {
  test("maps known code to translated message", () => {
    const moduleDefinition = loadModuleDefinition()
    const context = {
      translate(key) {
        if (key === "PTH_ERROR_TIMEOUT") {
          return "Localized timeout message"
        }

        return key
      },
    }

    const result = moduleDefinition.toUserFacingError.call(context, {
      code: "TIMEOUT",
      message: "Raw timeout",
    })

    assert.equal(result.code, "TIMEOUT")
    assert.equal(result.message, "Localized timeout message")
  })

  test("falls back to raw message when translation is missing", () => {
    const moduleDefinition = loadModuleDefinition()
    const context = {
      translate(key) {
        return key
      },
    }

    const result = moduleDefinition.toUserFacingError.call(context, {
      code: "RATE_LIMIT",
      message: "Raw rate limit message",
    })

    assert.equal(result.code, "RATE_LIMIT")
    assert.equal(result.message, "Raw rate limit message")
  })

  test("keeps message for unknown error codes", () => {
    const moduleDefinition = loadModuleDefinition()
    const context = {
      translate(key) {
        return key
      },
    }

    const result = moduleDefinition.toUserFacingError.call(context, {
      code: "SOMETHING_NEW",
      message: "Some new backend error",
    })

    assert.equal(result.code, "SOMETHING_NEW")
    assert.equal(result.message, "Some new backend error")
  })

  test("returns unknown message for invalid payloads", () => {
    const moduleDefinition = loadModuleDefinition()
    const context = {
      translate(key) {
        return key
      },
    }

    const result = moduleDefinition.toUserFacingError.call(context, null)

    assert.equal(result.message, "Unknown error")
  })

  test("forwards service alerts to MagicMirror", () => {
    const moduleDefinition = loadModuleDefinition()
    const notifications = []
    const context = {
      identifier: "module_1",
      sendNotification(notification, payload) {
        notifications.push({ notification, payload })
      },
    }

    moduleDefinition.socketNotificationReceived.call(context, "PTH_SERVICE_ALERT", {
      identifier: "module_1",
      notification: "PTH_SERVICE_ALERT",
      payload: {
        active: true,
        title: "Train cancelled",
        body: "The train was cancelled.",
      },
    })

    assert.deepEqual(notifications, [{
      notification: "PTH_SERVICE_ALERT",
      payload: {
        active: true,
        title: "Train cancelled",
        body: "The train was cancelled.",
      },
    }])
  })

  test("formats service alert departure times in 24-hour format", () => {
    const moduleDefinition = loadModuleDefinition()
    const notifications = []
    const context = {
      identifier: "module_1",
      config: { timeFormat: 24 },
      translate(key) {
        const translations = {
          PTH_ALERT_CANCELLATION_TITLE: "{line} Abfahrt fällt aus",
          PTH_ALERT_CANCELLATION_BODY: "Die Abfahrt um {time} Richtung {direction} fällt aus.",
        }
        return translations[key] || key
      },
      sendNotification(notification, payload) {
        notifications.push({ notification, payload })
      },
    }

    moduleDefinition.socketNotificationReceived.call(context, "PTH_SERVICE_ALERT", {
      identifier: "module_1",
      notification: "PTH_SERVICE_ALERT",
      payload: {
        active: true,
        kind: "cancellation",
        lineName: "12",
        direction: "Trotha",
        departureTime: new Date("2026-09-05T12:17:00").getTime(),
        departureTimeLabel: "12:17 PM",
      },
    })

    assert.match(notifications[0].payload.body, /12:17/)
    assert.doesNotMatch(notifications[0].payload.body, /AM|PM/)
  })
})
