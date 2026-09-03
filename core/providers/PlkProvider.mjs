import BaseProvider from "./BaseProvider.mjs"
import packageJson from "../../package.json" with { type: "json" }

const DEFAULT_PLK_BASE_URL = "https://pdp-api.plk-sa.pl"

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

  return `${appName}/${version} (+https://github.com/KristjanESPERANTO/MMM-PublicTransportHub)`
}

function routeKey(scheduleId, orderId) {
  return `${scheduleId}-${orderId}`
}

function findByStationId(entries, stationId) {
  return (entries || []).find(entry => String(entry.stationId) === String(stationId))
}

function findLastRouteStation(routeStations) {
  return (routeStations || []).reduce(
    (furthest, station) =>
      !furthest || station.orderNumber > furthest.orderNumber ? station : furthest,
    null,
  )
}

export default class PlkProvider extends BaseProvider {
  constructor(config) {
    super(config)

    this.baseUrl = DEFAULT_PLK_BASE_URL
    this.apiKey = String(config.apiKey || "").trim()
    this.headers = {
      "X-API-Key": this.apiKey,
      "User-Agent": buildUserAgent(config),
    }
  }

  async apiGet(path, query = {}) {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue
      }

      url.searchParams.set(key, value)
    }

    const response = await fetch(url, { headers: this.headers })

    if (!response.ok) {
      let details = ""
      try {
        const errorBody = await response.json()
        details = errorBody?.message || errorBody?.error || ""
      }
      catch {
        // Response body wasn't JSON, ignore and use the status text instead.
      }

      const error = new Error(
        `PLK API request to ${url.pathname} failed with status ${response.status}${details ? `: ${details}` : ""}`,
      )
      error.statusCode = response.status
      throw error
    }

    return response.json()
  }

  getStationName(stationId, operationsStations, scheduleStations) {
    return (
      operationsStations?.[stationId]
      || scheduleStations?.[stationId]?.name
      || ""
    )
  }

  async fetchDepartures() {
    const stationId = this.config.stationId

    const operationsResponse = await this.apiGet("/api/v1/operations", {
      stations: stationId,
      withPlanned: true,
      fullRoutes: true,
    })

    const trains = operationsResponse?.trains || []
    if (trains.length === 0) {
      return []
    }

    // /operations isn't limited to "today" - at low-traffic stations the
    // next train can be scheduled for a later calendar day. Derive the
    // /schedules date range from what /operations actually returned instead
    // of assuming "today", so the two responses can still be merged.
    const operatingDates = [...new Set(trains.map(train => train.operatingDate).filter(Boolean))].sort()
    const schedulesResponse = await this.apiGet("/api/v1/schedules", {
      stations: stationId,
      dateFrom: operatingDates[0],
      dateTo: operatingDates[operatingDates.length - 1],
      fullRoute: true,
      dictionaries: true,
    })

    const operationsStations = operationsResponse?.stations || {}
    const scheduleStations = schedulesResponse?.dictionaries?.stations || {}

    const routesByKey = new Map()
    for (const route of schedulesResponse?.routes || []) {
      routesByKey.set(routeKey(route.scheduleId, route.orderId), route)
    }

    const departures = []

    for (const train of trains) {
      const stationEntry = findByStationId(train.stations, stationId)
      if (!stationEntry) {
        continue
      }

      // Skip stations where the train only arrives (i.e. its final stop).
      const plannedDeparture = stationEntry.plannedDeparture
      const actualDeparture = stationEntry.actualDeparture
      if (!plannedDeparture && !actualDeparture) {
        continue
      }

      const route = routesByKey.get(routeKey(train.scheduleId, train.orderId))
      const routeStations = route?.stations || []
      const lastRouteStation = findLastRouteStation(routeStations)
      const direction = lastRouteStation
        ? this.getStationName(lastRouteStation.stationId, operationsStations, scheduleStations)
        : ""

      const routeStationEntry = findByStationId(routeStations, stationId)
      const platform
        = routeStationEntry?.departurePlatform || routeStationEntry?.arrivalPlatform || null

      // Prefer the short commercial category (e.g. "EIC", "TLK") for the line
      // badge - it's sized for short codes, and PLK's descriptive train
      // names are too long to fit without garbling.
      const lineName
        = route?.commercialCategorySymbol
          || route?.name
          || `Train ${train.scheduleId}/${train.orderId}`

      const delaySeconds = Number.isFinite(stationEntry.departureDelayMinutes)
        ? stationEntry.departureDelayMinutes * 60
        : null

      const canceled = Boolean(stationEntry.isCancelled) || train.trainStatus === "X"

      departures.push({
        tripId: `${train.scheduleId}-${train.orderId}-${train.operatingDate}`,
        when: formatClockTime(actualDeparture || plannedDeparture),
        plannedWhen: formatClockTime(plannedDeparture),
        rawWhen: actualDeparture || plannedDeparture,
        rawPlannedWhen: plannedDeparture || actualDeparture,
        realTime: Boolean(actualDeparture) || delaySeconds !== null,
        delay: delaySeconds,
        direction,
        line: {
          id: routeKey(train.scheduleId, train.orderId),
          name: lineName,
          product: route?.commercialCategorySymbol
            ? route.commercialCategorySymbol.toLowerCase()
            : null,
        },
        platform,
        // The PLK API exposes disruptions via a separate /disruptions
        // endpoint that isn't cross-referenced here yet.
        remarks: [],
        canceled,
      })
    }

    return this.finalizeDepartures(departures)
  }
}
