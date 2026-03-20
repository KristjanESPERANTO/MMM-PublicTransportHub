import BaseProvider from "./BaseProvider.mjs"
import { normalizeHafasLikeDeparture } from "./HafasLikeProviderUtils.mjs"

function uniqueByTripAndTime(departures) {
  const seen = new Set()
  return departures.filter((dep) => {
    const key = `${dep.tripId || dep.line?.id || "unknown"}-${dep.rawWhen || dep.rawPlannedWhen || ""}-${dep.direction || ""}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export default class HafasProvider extends BaseProvider {
  constructor(config) {
    super(config)
    this.clientPromise = null
  }

  async getClient() {
    if (!this.clientPromise) {
      this.clientPromise = this.initClient()
    }

    return this.clientPromise
  }

  async initClient() {
    const { createClient } = await import("hafas-client")
    const profileName = this.config.hafasProfile || "db"

    try {
      const { profile } = await import(
        `hafas-client/p/${profileName}/index.js`,
      )
      return createClient(profile, "MMM-PublicTransportHub")
    }
    catch (error) {
      const details = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Could not load HAFAS profile '${profileName}': ${details}`,
        { cause: error },
      )
    }
  }

  async fetchDepartures() {
    const client = await this.getClient()
    const maxDepartures = this.config.maxDepartures || 7
    const targetCount = Math.max(maxDepartures * 4, 25)
    const duration = Number.isFinite(this.config.timeInFutureMinutes)
      ? Math.max(1, Math.floor(this.config.timeInFutureMinutes))
      : 90

    const departureOptions = {
      results: targetCount,
      duration,
      remarks: true,
      linesOfStops: false,
    }

    const response = await client.departures(
      this.config.stationId,
      departureOptions,
    )

    let departures = Array.isArray(response)
      ? response
      : response?.departures || []

    if (departures.length === 0) {
      const locations = await client.locations(this.config.stationId, {
        results: 8,
        stations: true,
        addresses: false,
        poi: false,
      })

      const fallbackDepartures = []
      for (const location of locations || []) {
        if (!location?.id || location.id === this.config.stationId) {
          continue
        }

        try {
          const fallbackResponse = await client.departures(
            location.id,
            departureOptions,
          )
          const fallback = Array.isArray(fallbackResponse)
            ? fallbackResponse
            : fallbackResponse?.departures || []
          fallbackDepartures.push(...fallback)

          if (fallbackDepartures.length >= targetCount) {
            break
          }
        }
        catch {
          // Skip individual fallback IDs and continue.
        }
      }

      departures = fallbackDepartures
    }

    return this.finalizeDepartures(
      uniqueByTripAndTime(departures.map(normalizeHafasLikeDeparture)),
    )
  }
}
