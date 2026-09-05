import assert from "node:assert/strict"
import test, { describe } from "node:test"

import ServiceAlertDetector from "../core/ServiceAlertDetector.mjs"

const config = {
  enabled: true,
  includeCancellations: true,
  includeDelays: true,
  includeRemarks: true,
  delayThresholdMinutes: 10,
  includeNoDepartures: true,
}

function createDetector(overrides = {}) {
  const notifications = []
  const detector = new ServiceAlertDetector({
    config: { ...config, ...overrides },
    identifier: "module_1",
    provider: "transitous",
    stationId: "station-1",
    sendNotification: (notification, payload) => {
      notifications.push({ notification, payload })
    },
  })

  return { detector, notifications }
}

function departure(overrides = {}) {
  return {
    tripId: "trip-1",
    when: "10:20",
    plannedWhen: "10:00",
    rawWhen: "2026-09-05T10:20:00.000Z",
    rawPlannedWhen: "2026-09-05T10:00:00.000Z",
    delay: 1200,
    direction: "Downtown",
    line: { id: "line-1", name: "S1", product: "suburban" },
    reachable: true,
    ...overrides,
  }
}

describe("ServiceAlertDetector", () => {
  test("emits a delay alert once and resolves it", () => {
    const { detector, notifications } = createDetector({
      includeCancellations: false,
      includeRemarks: false,
      includeNoDepartures: false,
    })

    detector.process([departure()])
    detector.process([departure()])
    detector.process([departure({ delay: 0 })])

    assert.equal(notifications.length, 2)
    assert.equal(notifications[0].notification, "PTH_SERVICE_ALERT")
    assert.equal(notifications[0].payload.kind, "delay")
    assert.equal(notifications[0].payload.active, true)
    assert.match(notifications[0].payload.body, /10:20/)
    assert.equal(notifications[1].payload.id, notifications[0].payload.id)
    assert.equal(notifications[1].payload.active, false)
    assert.equal(notifications[1].payload.tripId, "trip-1")
    assert.equal(notifications[1].payload.direction, "Downtown")
    assert.equal(notifications[1].payload.scheduledTime > 0, true)
  })

  test("emits cancellation and remark alerts from normalized fields", () => {
    const { detector, notifications } = createDetector({
      includeDelays: false,
      includeNoDepartures: false,
    })

    detector.process([
      departure({
        canceled: true,
        remarks: [{ type: "warning", summary: "Replacement bus" }],
      }),
    ])

    assert.deepEqual(
      notifications.map(entry => entry.payload.kind),
      ["cancellation", "remark"],
    )
    assert.equal(notifications[0].payload.tripId, "trip-1")
    assert.match(notifications[0].payload.body, /10:20/)
    assert.equal(notifications[1].payload.remarks[0].summary, "Replacement bus")
  })

  test("emits and resolves the no-departures condition", () => {
    const { detector, notifications } = createDetector({
      includeCancellations: false,
      includeDelays: false,
      includeRemarks: false,
    })

    detector.process([])
    detector.process([])
    detector.process([departure({ delay: 0 })])

    assert.equal(notifications.length, 2)
    assert.equal(notifications[0].payload.kind, "no_departures")
    assert.equal(notifications[0].payload.active, true)
    assert.equal(notifications[1].payload.active, false)
  })

  test("does not emit when disabled", () => {
    const { detector, notifications } = createDetector({ enabled: false })

    detector.process([departure()])

    assert.equal(notifications.length, 0)
  })

  test("keeps alert identity stable when trip IDs contain colons", () => {
    const { detector, notifications } = createDetector({
      includeCancellations: true,
      includeDelays: false,
      includeRemarks: false,
      includeNoDepartures: false,
    })

    detector.process([departure({ tripId: "provider:trip-1", canceled: true })])
    detector.process([])

    assert.equal(notifications.length, 2)
    assert.equal(notifications[1].payload.kind, "cancellation")
    assert.equal(notifications[1].payload.tripId, "provider:trip-1")
    assert.equal(notifications[1].payload.active, false)
  })
})
