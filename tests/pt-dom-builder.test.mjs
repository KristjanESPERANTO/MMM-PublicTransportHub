import assert from "node:assert/strict"
import test, { describe } from "node:test"

import PtDomBuilder from "../core/PtDomBuilder.mjs"

function createElement(tagName) {
  return {
    tagName,
    children: [],
    appendChild(child) {
      this.children.push(child)
    },
    setAttribute() {},
  }
}

describe("PtDomBuilder", () => {
  describe("getRemarksText", () => {
    test("removes markup from departure remarks", () => {
      const builder = new PtDomBuilder({})

      assert.equal(
        builder.getRemarksText({
          remarks: [
            {
              summary: "Bike access <a href='tel:040'>limited</a>",
            },
          ],
        }),
        "Bike access limited",
      )
    })
  })

  describe("getProcessedLineName", () => {
    test("removes the redundant Bus prefix", () => {
      const builder = new PtDomBuilder({ replaceInLineNames: {} })

      assert.equal(
        builder.getProcessedLineName({ name: "Bus 184", product: "bus" }),
        "184",
      )
    })
  })

  describe("formatRelativeTime", () => {
    const translate = key => ({
      PTH_RELATIVE_TIME: "in {minutes} min",
      PTH_RELATIVE_TIME_NOW: "now",
    }[key])

    test("floors remaining time to the current minute", () => {
      const builder = new PtDomBuilder(
        { timeDisplay: { mode: "relative", thresholdMinutes: 10 } },
        translate,
      )
      const now = Date.parse("2026-09-21T12:00:00Z")

      assert.equal(
        builder.formatRelativeTime("2026-09-21T12:02:01Z", now),
        "in 2 min",
      )
    })

    test("returns the translated now label", () => {
      const builder = new PtDomBuilder(
        { timeDisplay: { mode: "relative", thresholdMinutes: 10 } },
        translate,
      )

      assert.equal(
        builder.formatRelativeTime(
          "2026-09-21T12:00:30Z",
          Date.parse("2026-09-21T12:00:31Z"),
        ),
        "now",
      )
    })
  })

  describe("getDisplayedTime", () => {
    const translate = key => ({
      PTH_RELATIVE_TIME: "in {minutes} min",
      PTH_RELATIVE_TIME_NOW: "now",
    }[key])

    test("uses relative time in relative mode", () => {
      const builder = new PtDomBuilder(
        { timeDisplay: { mode: "relative", thresholdMinutes: 10 } },
        translate,
      )
      const originalDateNow = Date.now
      Date.now = () => Date.parse("2026-09-21T12:00:00Z")

      try {
        assert.equal(
          builder.getDisplayedTime({ rawWhen: "2026-09-21T12:03:00Z" }),
          "in 3 min",
        )
      }
      finally {
        Date.now = originalDateNow
      }
    })

    test("uses relative time only below the configured threshold", () => {
      const builder = new PtDomBuilder(
        { timeDisplay: { mode: "relative-under", thresholdMinutes: 10 } },
        translate,
      )
      const now = Date.parse("2026-09-21T12:00:00Z")
      const originalDateNow = Date.now
      Date.now = () => now

      try {
        assert.equal(
          builder.getDisplayedTime({ rawWhen: "2026-09-21T12:09:59Z" }),
          "in 9 min",
        )
        assert.match(
          builder.getDisplayedTime({ rawWhen: "2026-09-21T12:10:00Z" }),
          /^\d{2}:\d{2}$/,
        )
      }
      finally {
        Date.now = originalDateNow
      }
    })
  })

  describe("getPlatformLabel", () => {
    test("removes the provider prefix", () => {
      const builder = new PtDomBuilder({})

      assert.equal(builder.getPlatformLabel("Pos. 6"), "6")
      assert.equal(builder.getPlatformLabel("6"), "6")
      assert.equal(builder.getPlatformLabel(null), "-")
    })
  })

  describe("getHeaderRow", () => {
    test("renders symbols in column order", () => {
      const originalDocument = globalThis.document
      globalThis.document = { createElement }

      try {
        const builder = new PtDomBuilder({})
        const row = builder.getHeaderRow([
          "time",
          "line",
          "direction",
          "platform",
        ])

        assert.equal(row.tagName, "tr")
        assert.deepEqual(
          row.children.map(cell => [cell.className, cell.children[0].className]),
          [
            ["mmm-pthub-header-cell mmm-pthub-header-time", "fa fa-clock-o"],
            ["mmm-pthub-header-cell mmm-pthub-header-line", "fa fa-bus"],
            [
              "mmm-pthub-header-cell mmm-pthub-header-direction",
              "fa fa-exchange",
            ],
            [
              "mmm-pthub-header-cell mmm-pthub-header-platform",
              "fa fa-map-marker",
            ],
          ],
        )
      }
      finally {
        globalThis.document = originalDocument
      }
    })
  })
})
