const Log = require("logger")
const NodeHelper = require("node_helper")

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
  const code = String(error?.code || error?.errno || "").toLowerCase()

  if (["err_stream_premature_close"].includes(code)) {
    return true
  }

  return [
    "econnreset",
    "econnrefused",
    "enotfound",
    "eai_again",
    "premature close",
    "invalid response body",
    "aborted",
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

function usesDbProfile(providerConfig = {}) {
  const profile = providerConfig.provider === "vendo"
    ? providerConfig.vendoProfile
    : providerConfig.provider === "hafas"
      ? providerConfig.hafasProfile
      : null

  return ["db", "dbweb"].includes(profile)
}

function classifyError(error, providerConfig) {
  // DB profiles use no credentials, so 403 is a block (body: OPS_BLOCKED), not bad auth.
  if (
    error?.code === "OPS_BLOCKED"
    || ([403, 452].includes(getHttpStatus(error)) && usesDbProfile(providerConfig))
  ) {
    return "db-blocked"
  }

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

  if (status === 401 || status === 403) {
    return "auth"
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
    case "db-blocked":
      return "DB_BLOCKED"
    case "timeout":
      return "TIMEOUT"
    case "network":
      return "NETWORK"
    case "rate-limit":
      return "RATE_LIMIT"
    case "auth":
      return "AUTH"
    case "server":
      return "SERVER"
    case "client":
      return "CLIENT"
    default:
      return "UNKNOWN"
  }
}

function isRetryableError(error, providerConfig) {
  return ["timeout", "network", "rate-limit", "server"].includes(
    classifyError(error, providerConfig),
  )
}

function toSocketErrorPayload(error, providerConfig) {
  const errorClass = classifyError(error, providerConfig)
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
    this.serviceAlertDetectors = new Map()
    this.fetchRequestIds = new Map()
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
        const errorClass = classifyError(error, provider.config)
        const shouldRetry = attempt < maxAttempts
          && isRetryableError(error, provider.config)

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
      const { default: ServiceAlertDetector } = await import(
        "./core/ServiceAlertDetector.mjs",
      )
      const provider = await createProvider(payload)
      this.providers.set(payload.identifier, provider)
      this.serviceAlertDetectors.set(
        payload.identifier,
        new ServiceAlertDetector({
          config: provider.config?.outgoingNotifications || {},
          identifier: payload.identifier,
          provider: provider.config?.provider || payload.provider,
          stationId: provider.config?.stationId || payload.stationId,
          sendNotification: (notification, alertPayload) => {
            this.sendSocketNotification("PTH_SERVICE_ALERT", {
              identifier: payload.identifier,
              notification,
              payload: alertPayload,
            })
          },
        }),
      )
      Log.info(`Fetcher created ${context}`)
      this.sendSocketNotification("PTH_FETCHER_READY", {
        identifier: payload.identifier,
      })
    }
    catch (error) {
      Log.error(`Failed to create provider ${context}`, error)
      this.sendSocketNotification("PTH_ERROR", {
        identifier: payload.identifier,
        error: toSocketErrorPayload(error, payload),
      })
    }
  },

  async fetchDepartures(payload) {
    this.fetchRequestIds ||= new Map()
    const previousRequestId = this.fetchRequestIds.get(payload.identifier) || 0
    const requestId = previousRequestId + 1
    this.fetchRequestIds.set(payload.identifier, requestId)
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

      if (this.fetchRequestIds.get(payload.identifier) !== requestId) {
        Log.info(`Ignoring outdated departure result ${context}`)
        return
      }

      this.serviceAlertDetectors?.get(payload.identifier)?.process(
        provider.serviceAlertDepartures || departures,
      )
      Log.info(`Fetched ${departures.length} departures ${context}`)
      this.sendSocketNotification("PTH_DEPARTURES", {
        identifier: payload.identifier,
        departures,
      })
    }
    catch (error) {
      if (this.fetchRequestIds.get(payload.identifier) !== requestId) {
        Log.info(`Ignoring outdated departure error ${context}`)
        return
      }

      Log.error(`Fetch failed ${context}`, error)
      this.sendSocketNotification("PTH_ERROR", {
        identifier: payload.identifier,
        error: toSocketErrorPayload(error, provider.config),
      })
    }
  },
})
