const Log = require("../../js/logger")
const NodeHelper = require("../../js/node_helper")

const DEFAULT_TIMEOUT_MS = 12000
const DEFAULT_RETRIES = 1

function toIntInRange(value, fallback, min, max) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.floor(value)))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isTimeoutError(error) {
  const message = String(error?.message || "").toLowerCase()
  return ["timeout", "timed out", "etimedout"].some(term =>
    message.includes(term),
  )
}

function isNetworkError(error) {
  const message = String(error?.message || "").toLowerCase()
  return [
    "econnreset",
    "econnrefused",
    "enotfound",
    "eai_again",
    "fetch failed",
    "network",
  ].some(term => message.includes(term))
}

function getHttpStatus(error) {
  const directStatus = Number(error?.statusCode || error?.status)
  if (Number.isInteger(directStatus) && directStatus >= 100) {
    return directStatus
  }

  const responseStatus = Number(
    error?.response?.statusCode || error?.response?.status,
  )
  if (Number.isInteger(responseStatus) && responseStatus >= 100) {
    return responseStatus
  }

  return null
}

function classifyError(error) {
  if (isTimeoutError(error)) {
    return "timeout"
  }

  if (isNetworkError(error)) {
    return "network"
  }

  const status = getHttpStatus(error)
  if (status === 429) {
    return "rate-limit"
  }

  if (status != null && status >= 500) {
    return "server"
  }

  if (status != null && status >= 400) {
    return "client"
  }

  return "unknown"
}

function toErrorCode(errorClass) {
  switch (errorClass) {
    case "timeout":
      return "TIMEOUT"
    case "network":
      return "NETWORK"
    case "rate-limit":
      return "RATE_LIMIT"
    case "server":
      return "SERVER"
    case "client":
      return "CLIENT"
    default:
      return "UNKNOWN"
  }
}

function isRetryableError(error) {
  return ["timeout", "network", "rate-limit", "server"].includes(
    classifyError(error),
  )
}

function toSocketErrorPayload(error) {
  const errorClass = classifyError(error)
  return {
    message: toErrorMessage(error),
    code: toErrorCode(errorClass),
  }
}

function getProviderContext(config = {}) {
  const provider = config.provider || "unknown"
  const stationId = config.stationId || "unknown"
  const hafasProfile = config.hafasProfile || "-"
  const vendoProfile = config.vendoProfile || "-"
  return `[id=${config.identifier || "unknown"} provider=${provider} stationId=${stationId} hafasProfile=${hafasProfile} vendoProfile=${vendoProfile}]`
}

function toErrorMessage(error) {
  if (typeof error === "string" && error.trim() !== "") {
    return error
  }

  if (typeof error?.message === "string" && error.message.trim() !== "") {
    return error.message
  }

  if (typeof error?.error === "string" && error.error.trim() !== "") {
    return error.error
  }

  if (typeof error?.cause?.message === "string" && error.cause.message.trim() !== "") {
    return error.cause.message
  }

  return "Unknown error"
}

module.exports = NodeHelper.create({
  start() {
    this.providers = new Map()
  },

  async fetchWithTimeout(provider, timeoutMs) {
    let timeoutId

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Fetch timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    try {
      return await Promise.race([provider.fetchDepartures(), timeoutPromise])
    }
    finally {
      clearTimeout(timeoutId)
    }
  },

  async fetchWithRetry(provider, { timeoutMs, retries, context }) {
    const maxAttempts = retries + 1
    let attempt = 0

    while (attempt < maxAttempts) {
      attempt += 1

      try {
        return await this.fetchWithTimeout(provider, timeoutMs)
      }
      catch (error) {
        const shouldRetry = attempt < maxAttempts && isRetryableError(error)
        const errorClass = classifyError(error)

        if (!shouldRetry) {
          throw error
        }

        const backoffMs = Math.min(3000, 600 * attempt)
        Log.warn(
          `Fetch attempt ${attempt}/${maxAttempts} failed (${errorClass}), retrying in ${backoffMs}ms ${context}: ${toErrorMessage(error)}`,
        )
        await sleep(backoffMs)
      }
    }

    return []
  },

  async socketNotificationReceived(notification, payload) {
    switch (notification) {
      case "PTH_CREATE_FETCHER":
        await this.createFetcher(payload)
        break
      case "PTH_FETCH_DEPARTURES":
        await this.fetchDepartures(payload)
        break
    }
  },

  async createFetcher(payload) {
    const context = getProviderContext(payload)

    try {
      const { createProvider } = await import("./core/ProviderFactory.mjs")
      const provider = await createProvider(payload)
      this.providers.set(payload.identifier, provider)
      Log.info(`Fetcher created ${context}`)
      this.sendSocketNotification("PTH_FETCHER_READY", {
        identifier: payload.identifier,
      })
    }
    catch (error) {
      Log.error(`Failed to create provider ${context}`, error)
      this.sendSocketNotification("PTH_ERROR", {
        identifier: payload.identifier,
        error: toSocketErrorPayload(error),
      })
    }
  },

  async fetchDepartures(payload) {
    const provider = this.providers.get(payload.identifier)
    const context = getProviderContext(provider?.config || payload)

    if (!provider) {
      Log.error(`Provider not initialized ${context}`)
      this.sendSocketNotification("PTH_ERROR", {
        identifier: payload.identifier,
        error: {
          message: "Provider not initialized.",
          code: "NOT_INITIALIZED",
        },
      })
      return
    }

    try {
      const timeoutMs = toIntInRange(
        provider.config?.requestTimeoutMs,
        DEFAULT_TIMEOUT_MS,
        1000,
        60000,
      )
      const retries = toIntInRange(
        provider.config?.fetchRetries,
        DEFAULT_RETRIES,
        0,
        5,
      )
      const departures = await this.fetchWithRetry(provider, {
        timeoutMs,
        retries,
        context,
      })
      Log.info(`Fetched ${departures.length} departures ${context}`)
      this.sendSocketNotification("PTH_DEPARTURES", {
        identifier: payload.identifier,
        departures,
      })
    }
    catch (error) {
      Log.error(`Fetch failed ${context}`, error)
      this.sendSocketNotification("PTH_ERROR", {
        identifier: payload.identifier,
        error: toSocketErrorPayload(error),
      })
    }
  },
})
