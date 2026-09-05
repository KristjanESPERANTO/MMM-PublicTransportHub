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
