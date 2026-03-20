import assert from "node:assert/strict"
import test from "node:test"

import { loadModuleDefinition } from "./test-helpers.mjs"

test("toUserFacingError maps known code to translated message", () => {
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

test("toUserFacingError falls back to raw message when translation is missing", () => {
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

test("toUserFacingError keeps message for unknown error codes", () => {
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

test("toUserFacingError returns unknown message for invalid payloads", () => {
  const moduleDefinition = loadModuleDefinition()
  const context = {
    translate(key) {
      return key
    },
  }

  const result = moduleDefinition.toUserFacingError.call(context, null)

  assert.equal(result.message, "Unknown error")
})
