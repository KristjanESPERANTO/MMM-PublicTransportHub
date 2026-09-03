import assert from "node:assert/strict"
import test, { describe } from "node:test"

import PtDomBuilder from "../core/PtDomBuilder.mjs"

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
})
