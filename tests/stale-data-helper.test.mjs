import assert from "node:assert/strict"
import test, { describe } from "node:test"

import {
  canUseStaleData,
  getVisibleDepartures,
} from "../core/StaleDataHelper.mjs"

describe("stale departure data", () => {
  test("uses advisory delays and keeps unknown departure times", () => {
    const plannedWhen = "2026-09-27T10:00:00.000Z"
    const delayed = { rawWhen: plannedWhen, rawPlannedWhen: plannedWhen, delay: 600 }
    const early = { rawWhen: plannedWhen, rawPlannedWhen: plannedWhen, delay: -600 }
    const unknown = { rawWhen: "invalid" }

    assert.deepEqual(
      getVisibleDepartures([delayed, early, unknown], Date.parse(plannedWhen)),
      [delayed, unknown],
    )
  })

  test("allows data inside the configured age window", () => {
    assert.equal(canUseStaleData(1000, 10, 1000 + 10 * 60 * 1000), true)
    assert.equal(canUseStaleData(1000, 10, 1000 + 10 * 60 * 1000 + 1), false)
  })

  test("removes departures that already passed", () => {
    const departures = [
      { rawWhen: "2026-09-27T10:00:00.000Z" },
      { rawWhen: "2026-09-27T10:01:00.000Z" },
    ]

    assert.deepEqual(
      getVisibleDepartures(
        departures,
        Date.parse("2026-09-27T10:00:30.000Z"),
      ),
      [departures[1]],
    )
  })
})
