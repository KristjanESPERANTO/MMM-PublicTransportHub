import assert from "node:assert/strict"
import http from "node:http"
import test, { describe } from "node:test"

import PlkProvider from "../core/providers/PlkProvider.mjs"
import TransitousProvider from "../core/providers/TransitousProvider.mjs"
import { loadNodeHelperModuleForTests } from "./test-helpers.mjs"

function startHangingServer() {
  return new Promise((resolve) => {
    let onReceived
    let onClosed
    const received = new Promise((done) => {
      onReceived = done
    })
    const closed = new Promise((done) => {
      onClosed = done
    })
    const server = http.createServer((_request, response) => {
      response.on("close", onClosed)
      onReceived()
    })

    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        received,
        closed,
        url: `http://127.0.0.1:${server.address().port}`,
      })
    })
  })
}

describe("request abort on timeout", () => {
  test("fetchWithTimeout aborts the provider request when the timeout fires", async () => {
    const helper = loadNodeHelperModuleForTests()
    let receivedSignal
    const provider = {
      fetchDepartures({ signal }) {
        receivedSignal = signal
        return new Promise(() => {})
      },
    }

    await assert.rejects(helper.fetchWithTimeout(provider, 20), /timed out after 20ms/)

    assert.equal(receivedSignal.aborted, true)
  })

  test("fetchWithTimeout leaves the signal untouched on success", async () => {
    const helper = loadNodeHelperModuleForTests()
    let receivedSignal
    const provider = {
      async fetchDepartures({ signal }) {
        receivedSignal = signal
        return [{ id: 1 }]
      },
    }

    const result = await helper.fetchWithTimeout(provider, 1000)

    assert.equal(result.length, 1)
    assert.equal(receivedSignal.aborted, false)
  })

  test("TransitousProvider closes the connection when the request is aborted", async () => {
    const hanging = await startHangingServer()

    try {
      const provider = new TransitousProvider({ stationId: "x" })
      provider.baseUrl = hanging.url
      const controller = new AbortController()
      const settled = assert.rejects(
        provider.fetchDepartures({ signal: controller.signal }),
        /timed out after 5ms/,
      )

      await hanging.received
      controller.abort(new Error("Fetch timed out after 5ms"))

      await settled
      await hanging.closed
    }
    finally {
      hanging.server.closeAllConnections()
      hanging.server.close()
    }
  })

  test("PlkProvider forwards the abort signal to the request", async () => {
    const originalFetch = globalThis.fetch
    let seenSignal
    globalThis.fetch = (_url, init) => {
      seenSignal = init.signal
      return new Promise((_, reject) => {
        seenSignal.addEventListener("abort", () => reject(seenSignal.reason))
      })
    }

    try {
      const provider = new PlkProvider({ stationId: "1", apiKey: "key" })
      const controller = new AbortController()
      const pending = provider.fetchDepartures({ signal: controller.signal })

      controller.abort(new Error("Fetch timed out after 5ms"))

      await assert.rejects(pending, /timed out after 5ms/)
      assert.equal(seenSignal, controller.signal)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })
})
