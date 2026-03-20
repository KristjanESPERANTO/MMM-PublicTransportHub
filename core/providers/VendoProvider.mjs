import BaseProvider from "./BaseProvider.mjs"
import { normalizeHafasLikeDeparture } from "./HafasLikeProviderUtils.mjs"

export default class VendoProvider extends BaseProvider {
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
    const { createClient } = await import("db-vendo-client")
    const profileName = this.config.vendoProfile || "db"

    try {
      const { profile } = await import(
        `db-vendo-client/p/${profileName}/index.js`,
      )
      return createClient(profile, "MMM-PublicTransportHub")
    }
    catch (error) {
      const details = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Could not load Vendo profile '${profileName}': ${details}`,
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

    const response = await client.departures(this.config.stationId, {
      results: targetCount,
      duration,
      remarks: true,
      linesOfStops: false,
    })

    const departures = Array.isArray(response)
      ? response
      : response?.departures || []
    return this.finalizeDepartures(departures.map(normalizeHafasLikeDeparture))
  }
}
