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

test("sanitizeConfig keeps valid columnOrder values", () => {
  const moduleDefinition = loadModuleDefinition()
  const context = {
    config: {
      columnOrder: ["line", "direction", "time"],
    },
  }

  moduleDefinition.sanitizeConfig.call(context)

  assert.deepEqual(context.config.columnOrder, ["line", "direction", "time"])
})

test("sanitizeConfig removes duplicates and invalid columnOrder values", () => {
  const moduleDefinition = loadModuleDefinition()
  const context = {
    config: {
      columnOrder: ["line", "line", "invalid", "platform", "TIME"],
    },
  }

  moduleDefinition.sanitizeConfig.call(context)

  assert.deepEqual(context.config.columnOrder, ["line", "platform", "time"])
})

test("sanitizeConfig falls back to default columnOrder when empty", () => {
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
