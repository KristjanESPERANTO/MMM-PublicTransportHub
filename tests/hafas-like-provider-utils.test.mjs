import assert from "node:assert/strict"
import test, { describe } from "node:test"

import {
  normalizeHafasLikeDeparture,
  withAbortSignalProfile,
} from "../core/providers/HafasLikeProviderUtils.mjs"

describe("withAbortSignalProfile", () => {
  test("preserves request transforms and adds the current signal", () => {
    const originalTransformReq = (_context, options) => ({
      ...options,
      headers: { "x-custom": "value" },
    })
    const profile = { transformReq: originalTransformReq }
    const abortableProfile = withAbortSignalProfile(profile)
    const controller = new AbortController()
    const requestOptions = { method: "GET" }

    const transformed = abortableProfile.transformReq(
      { opt: { signal: controller.signal } },
      requestOptions,
    )

    assert.equal(profile.transformReq, originalTransformReq)
    assert.equal(transformed.method, "GET")
    assert.equal(transformed.headers["x-custom"], "value")
    assert.equal(transformed.signal, controller.signal)
  })
})

describe("normalizeHafasLikeDeparture", () => {
  test("maps a typical API departure shape", () => {
    const departure = {
      tripId: "trip-123",
      when: "2026-03-22T10:07:00.000Z",
      plannedWhen: "2026-03-22T10:05:00.000Z",
      direction: "Central Station",
      line: {
        id: "S1",
        name: "S1",
        product: "suburban",
      },
      platform: "3",
      remarks: [
        {
          summary: "Construction",
          text: "Use track 3",
          type: "warning",
        },
      ],
      cancelled: false,
    }

    const result = normalizeHafasLikeDeparture(departure)

    const {
      when,
      plannedWhen,
      ...stable
    } = result

    assert.equal(typeof when, "string")
    assert.equal(typeof plannedWhen, "string")
    assert.notEqual(when.length, 0)
    assert.notEqual(plannedWhen.length, 0)

    assert.deepEqual(stable, {
      tripId: "trip-123",
      rawWhen: "2026-03-22T10:07:00.000Z",
      rawPlannedWhen: "2026-03-22T10:05:00.000Z",
      realTime: true,
      delay: 120,
      direction: "Central Station",
      line: {
        id: "S1",
        name: "S1",
        product: "suburban",
      },
      platform: "3",
      remarks: [
        {
          summary: "Construction",
          text: "Use track 3",
          type: "warning",
        },
      ],
      canceled: false,
    })
  })

  test("falls back for sparse input", () => {
    const result = normalizeHafasLikeDeparture({
      line: {},
    })

    assert.equal(result.when, "--:--")
    assert.equal(result.plannedWhen, "--:--")
    assert.equal(result.direction, "")
    assert.equal(result.line.name, "?")
    assert.equal(result.line.id, "")
    assert.equal(result.platform, null)
    assert.deepEqual(result.remarks, [])
    assert.equal(result.canceled, false)
  })

  test("prefers explicit delay over timestamp difference", () => {
    const result = normalizeHafasLikeDeparture({
      when: "2026-03-22T10:07:00.000Z",
      plannedWhen: "2026-03-22T10:05:00.000Z",
      delay: 150,
      line: { id: "S1", name: "S1", product: "suburban" },
    })

    assert.equal(result.delay, 150)
  })

  test("computes delay from timestamps when delay is missing", () => {
    const result = normalizeHafasLikeDeparture({
      when: "2026-03-22T10:09:00.000Z",
      plannedWhen: "2026-03-22T10:05:00.000Z",
      line: { id: "S1", name: "S1", product: "suburban" },
    })

    assert.equal(result.delay, 240)
  })

  test("computes negative delay for early departures", () => {
    const result = normalizeHafasLikeDeparture({
      when: "2026-03-22T10:03:00.000Z",
      plannedWhen: "2026-03-22T10:05:00.000Z",
      line: { id: "S1", name: "S1", product: "suburban" },
    })

    assert.equal(result.delay, -120)
  })
})
