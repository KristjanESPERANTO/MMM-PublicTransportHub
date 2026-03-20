import assert from "node:assert/strict"
import test from "node:test"

import { loadModuleDefinition } from "./test-helpers.mjs"

test("sanitizeConfig clamps timeInFutureMinutes to minimum 1", () => {
  const moduleDefinition = loadModuleDefinition()
  const context = {
    config: {
      timeInFutureMinutes: 0,
    },
  }

  moduleDefinition.sanitizeConfig.call(context)

  assert.equal(context.config.timeInFutureMinutes, 1)
})

test("sanitizeConfig floors finite timeInFutureMinutes values", () => {
  const moduleDefinition = loadModuleDefinition()
  const context = {
    config: {
      timeInFutureMinutes: 12.8,
    },
  }

  moduleDefinition.sanitizeConfig.call(context)

  assert.equal(context.config.timeInFutureMinutes, 12)
})

test("sanitizeConfig falls back to 90 when timeInFutureMinutes is invalid", () => {
  const moduleDefinition = loadModuleDefinition()
  const context = {
    config: {
      timeInFutureMinutes: Number.NaN,
    },
  }

  moduleDefinition.sanitizeConfig.call(context)

  assert.equal(context.config.timeInFutureMinutes, 90)
})
