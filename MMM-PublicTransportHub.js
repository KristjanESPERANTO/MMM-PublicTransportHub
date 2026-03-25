/* global Module Log */

function getErrorMessage(error) {
  if (typeof error === "string" && error.trim() !== "") {
    return error
  }

  if (typeof error?.message === "string" && error.message.trim() !== "") {
    return error.message
  }

  if (typeof error?.error === "string" && error.error.trim() !== "") {
    return error.error
  }

  return "Unknown error"
}

function getErrorTranslationKey(errorCode) {
  switch (errorCode) {
    case "TIMEOUT":
      return "PTH_ERROR_TIMEOUT"
    case "NETWORK":
      return "PTH_ERROR_NETWORK"
    case "RATE_LIMIT":
      return "PTH_ERROR_RATE_LIMIT"
    case "SERVER":
      return "PTH_ERROR_SERVER"
    case "CLIENT":
      return "PTH_ERROR_CLIENT"
    case "NOT_INITIALIZED":
      return "PTH_ERROR_NOT_INITIALIZED"
    default:
      return null
  }
}

Module.register("MMM-PublicTransportHub", {
  requiresVersion: "2.33.0",

  defaults: {
    name: "MMM-PublicTransportHub",
    provider: "transitous", // transitous | hafas | vendo
    stationId: "",
    updatesEvery: 60,
    maxDepartures: 7,
    animationSpeed: 1000,
    showLastUpdate: true,
    showDelay: false,
    showRealtimeIndicator: true,
    showRemarks: true,
    timeToStation: 0,
    maxUnreachableDepartures: 2,
    excludeCanceled: false,
    requestTimeoutMs: 12000,
    fetchRetries: 1,
    lineFilter: [],
    directionFilter: [],
    productFilter: [],
    replaceInDirections: {},
    replaceInLineNames: {},
    lineStylePreset: "none",
    contact: "",
    userAgent: "",
    clientVersion: "",
    hafasProfile: "db",
    vendoProfile: "db",
    timeInFutureMinutes: 90,
    includeRelatedStations: false,
  },

  async start() {
    this.sanitizeConfig()
    Log.info(`[MMM-PublicTransportHub] Starting module ${this.identifier}`)

    this.departures = []
    this.lastError = null
    this.lastUpdate = null
    this.initialized = false

    const { default: PtDomBuilder } = await import("./core/PtDomBuilder.mjs")
    this.domBuilder = new PtDomBuilder(this.config)

    if (!this.config.stationId) {
      this.lastError = { message: "No stationId configured." }
      this.updateDom(this.config.animationSpeed)
      return
    }

    const contact = String(this.config.contact || "").trim()
    if (
      this.config.provider === "transitous"
      && (contact === "" || contact === "you@example.com")
    ) {
      this.lastError = {
        message:
          "Transitous requires config.contact to be set. Please use an email address or a MagicMirror forum alias.",
      }
      this.updateDom(this.config.animationSpeed)
      return
    }

    this.sendSocketNotification("PTH_CREATE_FETCHER", {
      identifier: this.identifier,
      provider: this.config.provider,
      stationId: this.config.stationId,
      maxDepartures: this.config.maxDepartures,
      contact: this.config.contact,
      userAgent: this.config.userAgent,
      clientVersion: this.config.clientVersion,
      hafasProfile: this.config.hafasProfile,
      vendoProfile: this.config.vendoProfile,
      timeInFutureMinutes: this.config.timeInFutureMinutes,
      includeRelatedStations: this.config.includeRelatedStations,
      timeToStation: this.config.timeToStation,
      maxUnreachableDepartures: this.config.maxUnreachableDepartures,
      excludeCanceled: this.config.excludeCanceled,
      requestTimeoutMs: this.config.requestTimeoutMs,
      fetchRetries: this.config.fetchRetries,
      lineFilter: this.config.lineFilter,
      directionFilter: this.config.directionFilter,
      productFilter: this.config.productFilter,
      replaceInDirections: this.config.replaceInDirections,
    })
  },

  sanitizeConfig() {
    this.config.updatesEvery = Number.isFinite(this.config.updatesEvery)
      ? Math.max(30, Math.floor(this.config.updatesEvery))
      : 60

    this.config.maxDepartures = Number.isFinite(this.config.maxDepartures)
      ? Math.max(1, Math.floor(this.config.maxDepartures))
      : 7

    this.config.timeToStation = Number.isFinite(this.config.timeToStation)
      ? Math.max(0, Math.floor(this.config.timeToStation))
      : 0

    this.config.maxUnreachableDepartures
      = Number.isFinite(this.config.maxUnreachableDepartures)
        ? Math.max(0, Math.floor(this.config.maxUnreachableDepartures))
        : null

    this.config.requestTimeoutMs = Number.isFinite(this.config.requestTimeoutMs)
      ? Math.min(
          60000,
          Math.max(1000, Math.floor(this.config.requestTimeoutMs)),
        )
      : 12000

    this.config.fetchRetries = Number.isFinite(this.config.fetchRetries)
      ? Math.min(5, Math.max(0, Math.floor(this.config.fetchRetries)))
      : 1

    this.config.timeInFutureMinutes = Number.isFinite(this.config.timeInFutureMinutes)
      ? Math.max(1, Math.floor(this.config.timeInFutureMinutes))
      : 90

    const hasPlainObjectReplacements
      = this.config.replaceInDirections != null
        && typeof this.config.replaceInDirections === "object"
        && !Array.isArray(this.config.replaceInDirections)
    this.config.replaceInDirections = hasPlainObjectReplacements
      ? this.config.replaceInDirections
      : {}

    const hasPlainObjectLineReplacements
      = this.config.replaceInLineNames != null
        && typeof this.config.replaceInLineNames === "object"
        && !Array.isArray(this.config.replaceInLineNames)
    this.config.replaceInLineNames = hasPlainObjectLineReplacements
      ? this.config.replaceInLineNames
      : {}

    const allowedLineStylePresets = new Set([
      "plain",
      "none",
      "berlin",
      "duesseldorf",
      "graz",
      "halle",
      "hamburg",
      "hannover",
      "leipzig",
      "magdeburg",
      "munich",
      "nuernberg",
      "stuttgart",
    ])
    const requestedPreset = String(this.config.lineStylePreset || "none")
      .trim()
      .toLowerCase()
    this.config.lineStylePreset = allowedLineStylePresets.has(requestedPreset)
      ? requestedPreset
      : "none"
  },

  getStyles() {
    const styles = [this.file("css/styles.css")]
    if (this.config.lineStylePreset !== "none") {
      styles.push(
        this.file(`css/line-presets/${this.config.lineStylePreset}.css`),
      )
    }

    return styles
  },

  getTranslations() {
    return {
      en: "translations/en.json",
      de: "translations/de.json",
      es: "translations/es.json",
    }
  },

  getDom() {
    if (this.lastError) {
      return this.domBuilder.getMessageDom(`${this.translate("PTH_ERROR_PREFIX")}: ${getErrorMessage(this.lastError)}`)
    }

    if (!this.initialized) {
      return this.domBuilder.getMessageDom(this.translate("LOADING"))
    }

    return this.domBuilder.getDeparturesDom(this.departures, this.lastUpdate)
  },

  socketNotificationReceived(notification, payload) {
    if (!payload || payload.identifier !== this.identifier) {
      return
    }

    switch (notification) {
      case "PTH_FETCHER_READY":
        this.initialized = true
        this.fetchNow()
        this.startLoop()
        this.updateDom(this.config.animationSpeed)
        break

      case "PTH_DEPARTURES":
        this.departures = payload.departures || []
        this.lastUpdate = new Date()
        this.lastError = null
        this.updateDom(this.config.animationSpeed)
        break

      case "PTH_ERROR":
        this.lastError = this.toUserFacingError(payload.error)
        this.updateDom(this.config.animationSpeed)
        break
    }
  },

  toUserFacingError(error) {
    if (!error || typeof error !== "object") {
      return { message: "Unknown error" }
    }

    const translationKey = getErrorTranslationKey(error.code)
    if (!translationKey) {
      return {
        ...error,
        message: getErrorMessage(error),
      }
    }

    const translated = this.translate(translationKey)
    const hasTranslation = translated && translated !== translationKey
    return {
      ...error,
      message: hasTranslation ? translated : getErrorMessage(error),
    }
  },

  startLoop() {
    if (this._timer) {
      clearInterval(this._timer)
    }

    this._timer = setInterval(
      () => this.fetchNow(),
      this.config.updatesEvery * 1000,
    )
  },

  fetchNow() {
    this.sendSocketNotification("PTH_FETCH_DEPARTURES", {
      identifier: this.identifier,
    })
  },
})
