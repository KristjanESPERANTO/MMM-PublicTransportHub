export default class BaseProvider {
  constructor(config) {
    this.config = config
  }

  toTimestamp(departure) {
    const raw = departure?.rawWhen || departure?.rawPlannedWhen
    if (!raw) {
      return Number.MAX_SAFE_INTEGER
    }

    const ts = new Date(raw).getTime()
    return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER
  }

  normalizeFilterList(value) {
    if (Array.isArray(value)) {
      return value
        .map(entry =>
          String(entry || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    }

    if (typeof value === "string") {
      return value
        .split(",")
        .map(entry => entry.trim().toLowerCase())
        .filter(Boolean)
    }

    return []
  }

  matchesAnyFilter(value, filterList) {
    if (!filterList || filterList.length === 0) {
      return true
    }

    const haystack = String(value || "").toLowerCase()
    return filterList.some(needle => haystack.includes(needle))
  }

  normalizeDirectionReplacements() {
    const replacements = this.config.replaceInDirections
    if (
      !replacements
      || typeof replacements !== "object"
      || Array.isArray(replacements)
    ) {
      return []
    }

    return Object.entries(replacements)
      .filter(([search]) => typeof search === "string" && search.length > 0)
      .map(([search, replacement]) => [search, String(replacement ?? "")])
  }

  applyDirectionReplacements(direction) {
    let result = String(direction || "")
    for (const [search, replacement] of this.normalizeDirectionReplacements()) {
      result = result.split(search).join(replacement)
    }

    return result
  }

  withDirectionReplacements(departure) {
    const nextDirection = this.applyDirectionReplacements(departure?.direction)
    if (nextDirection === (departure?.direction || "")) {
      return departure
    }

    return {
      ...departure,
      direction: nextDirection,
    }
  }

  withReachability(departure, nowTs) {
    const timeToStationMinutes = Number.isFinite(this.config.timeToStation)
      ? Math.max(0, this.config.timeToStation)
      : 0
    const departureTs = this.toTimestamp(departure)

    const reachable
      = departureTs === Number.MAX_SAFE_INTEGER
        ? true
        : departureTs >= nowTs + timeToStationMinutes * 60 * 1000

    return {
      ...departure,
      reachable,
    }
  }

  withUnreachableLimit(departures, maxUnreachableDepartures) {
    if (maxUnreachableDepartures === null) {
      return departures
    }

    if (maxUnreachableDepartures === 0) {
      return departures.filter(departure => departure.reachable !== false)
    }

    const unreachableIndexes = departures
      .map((departure, index) =>
        departure.reachable === false ? index : -1,
      )
      .filter(index => index >= 0)

    if (unreachableIndexes.length <= maxUnreachableDepartures) {
      return departures
    }

    const keepUnreachableIndexes = new Set(
      unreachableIndexes.slice(-maxUnreachableDepartures),
    )

    return departures.filter(
      (departure, index) => departure.reachable !== false || keepUnreachableIndexes.has(index),
    )
  }

  finalizeDepartures(departures) {
    const nowTs = Date.now()
    const pastGraceSeconds = Number.isFinite(this.config.pastGraceSeconds)
      ? Math.max(0, Math.floor(this.config.pastGraceSeconds))
      : 30
    const minDepartureTs = nowTs - pastGraceSeconds * 1000
    const maxDepartures = Number.isFinite(this.config.maxDepartures)
      ? Math.max(1, Math.floor(this.config.maxDepartures))
      : 7

    const lineFilter = this.normalizeFilterList(this.config.lineFilter)
    const directionFilter = this.normalizeFilterList(
      this.config.directionFilter,
    )
    const productFilter = this.normalizeFilterList(this.config.productFilter)
    const maxUnreachableDepartures
      = Number.isFinite(this.config.maxUnreachableDepartures)
        ? Math.max(0, Math.floor(this.config.maxUnreachableDepartures))
        : null
    const excludeCanceled = Boolean(this.config.excludeCanceled)

    const filteredAndSorted = (departures || [])
      .map(departure => this.withDirectionReplacements(departure))
      .map(departure => this.withReachability(departure, nowTs))
      .filter((departure) => {
        const departureTs = this.toTimestamp(departure)
        if (
          departureTs !== Number.MAX_SAFE_INTEGER
          && departureTs < minDepartureTs
        ) {
          return false
        }

        if (excludeCanceled && departure.canceled) {
          return false
        }

        const lineName = departure.line?.name || ""
        const lineId = departure.line?.id || ""
        const direction = departure.direction || ""
        const product = departure.line?.product || ""

        const lineMatches = this.matchesAnyFilter(
          `${lineName} ${lineId}`,
          lineFilter,
        )
        const directionMatches = this.matchesAnyFilter(
          direction,
          directionFilter,
        )
        const productMatches = this.matchesAnyFilter(product, productFilter)

        return lineMatches && directionMatches && productMatches
      })
      .sort((a, b) => this.toTimestamp(a) - this.toTimestamp(b))

    return this.withUnreachableLimit(
      filteredAndSorted,
      maxUnreachableDepartures,
    )
      .slice(0, maxDepartures)
  }

  async fetchDepartures() {
    // Placeholder provider for unsupported names during early scaffold stage.
    return []
  }
}
