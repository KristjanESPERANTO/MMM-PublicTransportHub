import assert from "node:assert/strict"
import test, { describe } from "node:test"

import { getLineStyleTokens } from "../core/LineStyleTokens.mjs"

describe("getLineStyleTokens", () => {
  test("derives token from letter-prefixed line name", () => {
    const result = getLineStyleTokens({
      name: "STR 11",
      id: "11",
      product: "tram",
    })

    assert.equal(result.productToken, "str")
    assert.equal(result.lineToken, "str11")
    assert.equal(result.lineId, "11")
  })

  test("builds product+id token for numeric-only line names", () => {
    const result = getLineStyleTokens({
      name: "10",
      id: "10",
      product: "u",
    })

    assert.equal(result.productToken, "u")
    assert.equal(result.lineToken, "u10")
  })

  test("falls back to unknown for empty line objects", () => {
    const result = getLineStyleTokens({})

    assert.equal(result.productToken, "")
    assert.equal(result.lineToken, "unknown")
    assert.equal(result.lineId, "")
  })

  test("normalizes Bus S-lines to rail line tokens", () => {
    const result = getLineStyleTokens({
      name: "Bus S7",
      id: "S7",
    })

    assert.equal(result.productToken, "bus")
    assert.equal(result.lineToken, "s7")
  })

  test("canonicalizes DB product families", () => {
    const result = getLineStyleTokens({
      name: "ICE 1507",
      id: "1507",
    })

    assert.equal(result.productToken, "ice")
    assert.equal(result.lineToken, "ice1507")
  })

  test("maps nationalExpress product to ICE token", () => {
    const result = getLineStyleTokens({
      name: "ICE 934",
      id: "934",
      product: "nationalExpress",
    })

    assert.equal(result.productToken, "ice")
    assert.equal(result.lineToken, "ice934")
  })

  test("maps EC lines to IC styling", () => {
    const result = getLineStyleTokens({
      name: "EC 47",
      id: "47",
      product: "train",
    })

    assert.equal(result.productToken, "ic")
    assert.equal(result.lineToken, "ec47")
  })
})
