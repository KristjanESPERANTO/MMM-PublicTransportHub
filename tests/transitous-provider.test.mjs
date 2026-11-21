import assert from "node:assert/strict"
import test from "node:test"

import TransitousProvider from "../core/providers/TransitousProvider.mjs"

async function fetchDirections(stopTimes, config = {}) {
  const originalFetch = globalThis.fetch
  const departure = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  globalThis.fetch = async () => Response.json({
    stopTimes: stopTimes.map(stopTime => ({
      mode: "REGIONAL_RAIL",
      displayName: "TER 866229",
      place: {
        departure,
        scheduledDeparture: departure,
      },
      ...stopTime,
    })),
  })

  try {
    const provider = new TransitousProvider({
      stationId: "test-stop",
      ...config,
    })
    return (await provider.fetchDepartures()).map(item => item.direction)
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

test("TransitousProvider normalizes departure directions", async (context) => {
  await context.test("falls back to tripTo.name when headsign is empty", async () => {
    const directions = await fetchDirections([
      { headsign: "", tripTo: { name: "Arcachon" } },
      { headsign: "   ", tripTo: { name: "Bordeaux" } },
    ])

    assert.deepEqual(directions, ["Arcachon", "Bordeaux"])
  })

  await context.test("prefers headsign over tripTo.name", async () => {
    const directions = await fetchDirections([
      { headsign: "ARCACHON CENTRE", tripTo: { name: "Arcachon" } },
    ])

    assert.deepEqual(directions, ["ARCACHON CENTRE"])
  })

  await context.test("keeps an empty direction when both values are absent", async () => {
    const directions = await fetchDirections([{}])

    assert.deepEqual(directions, [""])
  })

  await context.test("applies replacements and filters to the fallback", async () => {
    const directions = await fetchDirections([
      { headsign: "", tripTo: { name: "Arcachon" } },
      { headsign: "", tripTo: { name: "Bordeaux" } },
    ], {
      directionFilter: ["Arcachon Central"],
      replaceInDirections: {
        Arcachon: "Arcachon Central",
      },
    })

    assert.deepEqual(directions, ["Arcachon Central"])
  })
})
