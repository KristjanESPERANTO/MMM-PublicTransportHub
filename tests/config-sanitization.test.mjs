import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { loadModuleDefinition } from "./test-helpers.mjs"

describe("sanitizeConfig", () => {
  describe("provider", () => {
    test("normalizes supported provider names", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          provider: " HAFAS ",
        },
      }

      const result = moduleDefinition.sanitizeConfig.call(context)

      assert.equal(result, null)
      assert.equal(context.config.provider, "hafas")
    })

    test("reports unknown providers", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          provider: "unsupported",
        },
      }

      const result = moduleDefinition.sanitizeConfig.call(context)

      assert.match(result, /Unknown provider: "unsupported"/)
    })
  })

  describe("timeInFutureMinutes", () => {
    test("clamps to minimum 1", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          timeInFutureMinutes: 0,
        },
      }

      moduleDefinition.sanitizeConfig.call(context)

      assert.equal(context.config.timeInFutureMinutes, 1)
    })

    test("floors finite values", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          timeInFutureMinutes: 12.8,
        },
      }

      moduleDefinition.sanitizeConfig.call(context)

      assert.equal(context.config.timeInFutureMinutes, 12)
    })

    test("falls back to 90 when invalid", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          timeInFutureMinutes: Number.NaN,
        },
      }

      moduleDefinition.sanitizeConfig.call(context)

      assert.equal(context.config.timeInFutureMinutes, 90)
    })
  })

  describe("outgoingNotifications", () => {
    test("sanitizes notification settings and defaults", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          outgoingNotifications: {
            enabled: true,
            delayThresholdMinutes: 12.8,
            includeRemarks: false,
          },
        },
      }

      moduleDefinition.sanitizeConfig.call(context)

      assert.deepEqual(context.config.outgoingNotifications, {
        enabled: true,
        includeCancellations: true,
        includeDelays: true,
        includeRemarks: false,
        delayThresholdMinutes: 12,
        includeNoDepartures: false,
      })
    })
  })

  describe("columnOrder", () => {
    test("keeps valid values", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          columnOrder: ["line", "direction", "time"],
        },
      }

      moduleDefinition.sanitizeConfig.call(context)

      assert.deepEqual(context.config.columnOrder, ["line", "direction", "time"])
    })

    test("removes duplicates and invalid values", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          columnOrder: ["line", "line", "invalid", "platform", "TIME"],
        },
      }

      moduleDefinition.sanitizeConfig.call(context)

      assert.deepEqual(context.config.columnOrder, ["line", "platform", "time"])
    })

    test("falls back to default when empty", () => {
      const moduleDefinition = loadModuleDefinition()
      const context = {
        config: {
          columnOrder: [],
        },
      }

      moduleDefinition.sanitizeConfig.call(context)

      assert.deepEqual(context.config.columnOrder, [
        "time",
        "line",
        "direction",
        "platform",
      ])
    })
  })
})
