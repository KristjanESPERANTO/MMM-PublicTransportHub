import assert from "node:assert/strict"
import test from "node:test"

import BaseProvider from "../core/providers/BaseProvider.mjs"

function isoInMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

test("normalizeFilterList supports arrays and comma strings", () => {
  const provider = new BaseProvider({})

  assert.deepEqual(provider.normalizeFilterList([" S1 ", "", "U2"]), ["s1", "u2"])
  assert.deepEqual(provider.normalizeFilterList("  S1, U2 ,,Bus  "), ["s1", "u2", "bus"])
  assert.deepEqual(provider.normalizeFilterList(null), [])
})

test("finalizeDepartures applies replacements, filtering, sorting and maxDepartures", () => {
  const provider = new BaseProvider({
    maxDepartures: 2,
    lineFilter: "u2",
    directionFilter: "hauptbahnhof",
    replaceInDirections: {
      Hbf: "Hauptbahnhof",
    },
  })

  const departures = [
    {
      rawWhen: isoInMinutes(12),
      direction: "Hbf",
      line: { name: "U2", id: "u2", product: "subway" },
    },
    {
      rawWhen: isoInMinutes(7),
      direction: "Hbf",
      line: { name: "U2", id: "u2", product: "subway" },
    },
    {
      rawWhen: isoInMinutes(20),
      direction: "Airport",
      line: { name: "U2", id: "u2", product: "subway" },
    },
  ]

  const result = provider.finalizeDepartures(departures)

  assert.equal(result.length, 2)
  assert.equal(result[0].direction, "Hauptbahnhof")
  assert.equal(result[1].direction, "Hauptbahnhof")
  assert.ok(new Date(result[0].rawWhen).getTime() < new Date(result[1].rawWhen).getTime())
})

test("finalizeDepartures filters canceled, unreachable and past departures", () => {
  const provider = new BaseProvider({
    timeToStation: 10,
    hideUnreachableDepartures: true,
    excludeCanceled: true,
    pastGraceSeconds: 5,
    maxDepartures: 10,
  })

  const departures = [
    {
      rawWhen: isoInMinutes(-1),
      direction: "Old",
      line: { name: "S1", id: "s1", product: "suburban" },
    },
    {
      rawWhen: isoInMinutes(5),
      direction: "Too soon",
      line: { name: "S1", id: "s1", product: "suburban" },
    },
    {
      rawWhen: isoInMinutes(15),
      direction: "Canceled",
      canceled: true,
      line: { name: "S1", id: "s1", product: "suburban" },
    },
    {
      rawWhen: isoInMinutes(16),
      direction: "Valid",
      line: { name: "S1", id: "s1", product: "suburban" },
    },
  ]

  const result = provider.finalizeDepartures(departures)

  assert.equal(result.length, 1)
  assert.equal(result[0].direction, "Valid")
  assert.equal(result[0].reachable, true)
})

test("finalizeDepartures requires line, direction and product filters to match together", () => {
  const provider = new BaseProvider({
    maxDepartures: 10,
    lineFilter: ["m4", "tram"],
    directionFilter: "center",
    productFilter: "tram",
  })

  const departures = [
    {
      rawWhen: isoInMinutes(8),
      direction: "City Center",
      line: { name: "Tram M4", id: "m4", product: "tram" },
    },
    {
      rawWhen: isoInMinutes(9),
      direction: "City Center",
      line: { name: "Bus M4", id: "m4", product: "bus" },
    },
    {
      rawWhen: isoInMinutes(10),
      direction: "Airport",
      line: { name: "Tram M4", id: "m4", product: "tram" },
    },
  ]

  const result = provider.finalizeDepartures(departures)

  assert.equal(result.length, 1)
  assert.equal(result[0].line.product, "tram")
  assert.equal(result[0].direction, "City Center")
})

test("finalizeDepartures applies direction replacements before direction filtering", () => {
  const provider = new BaseProvider({
    maxDepartures: 10,
    directionFilter: "hauptbahnhof",
    replaceInDirections: {
      Hbf: "Hauptbahnhof",
    },
  })

  const departures = [
    {
      rawWhen: isoInMinutes(6),
      direction: "Hbf",
      line: { name: "S1", id: "s1", product: "suburban" },
    },
    {
      rawWhen: isoInMinutes(7),
      direction: "Town Hall",
      line: { name: "S1", id: "s1", product: "suburban" },
    },
  ]

  const result = provider.finalizeDepartures(departures)

  assert.equal(result.length, 1)
  assert.equal(result[0].direction, "Hauptbahnhof")
})

test("finalizeDepartures sorts unknown timestamps last", () => {
  const provider = new BaseProvider({ maxDepartures: 10 })

  const departures = [
    {
      direction: "No timestamp",
      line: { name: "U2", id: "u2", product: "subway" },
    },
    {
      rawWhen: isoInMinutes(4),
      direction: "Soon",
      line: { name: "U2", id: "u2", product: "subway" },
    },
  ]

  const result = provider.finalizeDepartures(departures)

  assert.equal(result.length, 2)
  assert.equal(result[0].direction, "Soon")
  assert.equal(result[1].direction, "No timestamp")
})

test("finalizeDepartures lineFilter matches line.id independent of line.name", () => {
  const provider = new BaseProvider({
    maxDepartures: 10,
    lineFilter: "m10",
  })

  const departures = [
    {
      rawWhen: isoInMinutes(6),
      direction: "Center",
      line: { name: "Tram Ten", id: "M10", product: "tram" },
    },
    {
      rawWhen: isoInMinutes(7),
      direction: "Center",
      line: { name: "Tram Eleven", id: "M11", product: "tram" },
    },
  ]

  const result = provider.finalizeDepartures(departures)

  assert.equal(result.length, 1)
  assert.equal(result[0].line.id, "M10")
})

test("finalizeDepartures handles missing line safely and keeps matching entries", () => {
  const provider = new BaseProvider({
    maxDepartures: 10,
    lineFilter: "u2",
  })

  const departures = [
    {
      rawWhen: isoInMinutes(4),
      direction: "Broken shape",
    },
    {
      rawWhen: isoInMinutes(5),
      direction: "Valid",
      line: { name: "U2", id: "u2", product: "subway" },
    },
  ]

  const result = provider.finalizeDepartures(departures)

  assert.equal(result.length, 1)
  assert.equal(result[0].direction, "Valid")
})
