import BaseProvider from "./BaseProvider.mjs"
import packageJson from "../../package.json" with { type: "json" }
import { stoptimes } from "@motis-project/motis-client"

const DEFAULT_TRANSITOUS_BASE_URL = "https://api.transitous.org"

function formatClockTime(when) {
  if (!when) {
    return "--:--"
  }

  const date = new Date(when)
  if (Number.isNaN(date.getTime())) {
    return "--:--"
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildUserAgent(config = {}) {
  if (config.userAgent) {
    return config.userAgent
  }

  const appName = "MMM-PublicTransportHub"
  const version = config.clientVersion || packageJson.version || "0.1.0"
  const contact
    = config.contact
      || "https://github.com/KristjanESPERANTO/MMM-PublicTransportHub"

  return `${appName}/${version} (+${contact})`
}

function toRemarks(alerts = []) {
  return alerts.map(alert => ({
    summary: alert.headerText || "Service alert",
    text: alert.descriptionText || alert.headerText || "",
    type:
      alert.severityLevel === "WARNING" || alert.severityLevel === "SEVERE"
        ? "warning"
        : "hint",
  }))
}

function normalizeDeparture(stopTime) {
  const place = stopTime.place || {}
  const realTime = stopTime.realTime === true

  const rawWhen = place.departure || place.scheduledDeparture || null
  const rawPlannedWhen = place.scheduledDeparture || place.departure || null

  const delay
    = rawWhen && rawPlannedWhen
      ? Math.round(
          (new Date(rawWhen).getTime() - new Date(rawPlannedWhen).getTime())
          / 1000,
        )
      : null

  const lineName
    = stopTime.displayName
      || stopTime.routeShortName
      || stopTime.routeLongName
      || "?"
  const product
    = typeof stopTime.mode === "string" ? stopTime.mode.toLowerCase() : null

  return {
    tripId: stopTime.tripId || null,
    when: formatClockTime(rawWhen),
    plannedWhen: formatClockTime(rawPlannedWhen),
    rawWhen,
    rawPlannedWhen,
    realTime,
    hasRealtime: realTime,
    delay,
    direction: stopTime.headsign || "",
    line: {
      id: stopTime.routeId || "",
      name: lineName,
      product,
    },
    platform: place.track || place.scheduledTrack || null,
    remarks: toRemarks(stopTime.alerts || place.alerts || []),
    canceled: stopTime.cancelled || place.cancelled || false,
  }
}

function isFetchStopsTripTerminalError(error) {
  return String(error?.error || error?.message || "")
    .toLowerCase()
    .includes("departure is last stop in trip")
}

export default class TransitousProvider extends BaseProvider {
  constructor(config) {
    super(config)

    this.baseUrl = DEFAULT_TRANSITOUS_BASE_URL
    if (typeof config.baseUrl === "string" && config.baseUrl.trim() !== "") {
      process.emitWarning(
        "config.baseUrl is deprecated and ignored. Transitous base URL is fixed in MMM-PublicTransportHub.",
        {
          code: "PTH_BASEURL_DEPRECATED",
          type: "DeprecationWarning",
        },
      )
    }

    this.headers = {
      "User-Agent": buildUserAgent(config),
    }
    this.timeInFutureMinutes = Number.isFinite(config.timeInFutureMinutes)
      ? Math.max(1, Math.floor(config.timeInFutureMinutes))
      : 90
    this.includeRelatedStations = Boolean(config.includeRelatedStations)
  }

  async fetchDepartures() {
    const now = new Date()
    const maxDepartures = this.config.maxDepartures || 7
    const fetchCount = Math.max(maxDepartures * 4, 40)
    const latestDepartureTs = now.getTime() + this.timeInFutureMinutes * 60 * 1000

    const fetchOptions = {
      throwOnError: true,
      baseUrl: this.baseUrl,
      headers: this.headers,
      query: {
        stopId: "",
        time: now.toISOString(),
        n: fetchCount,
        withAlerts: true,
        fetchStops: this.includeRelatedStations,
      },
    }

    fetchOptions.query.stopId = this.config.stationId
    let response

    try {
      response = await stoptimes(fetchOptions)
    }
    catch (error) {
      if (!this.includeRelatedStations || !isFetchStopsTripTerminalError(error)) {
        throw error
      }

      response = await stoptimes({
        ...fetchOptions,
        query: {
          ...fetchOptions.query,
          fetchStops: false,
        },
      })
    }

    const departures = response?.data?.stopTimes || []
    return this.finalizeDepartures(
      departures.map(normalizeDeparture).filter((departure) => {
        if (!departure.rawWhen) {
          return true
        }

        const departureTs = new Date(departure.rawWhen).getTime()
        return Number.isFinite(departureTs) && departureTs <= latestDepartureTs
      }),
    )
  }
}
