import * as readline from "node:readline"
import process from "node:process"
import { geocode, stoptimes } from "@motis-project/motis-client"

const DEFAULT_BASE_URL = "https://api.transitous.org"
const DEFAULT_CONTACT
  = "https://github.com/KristjanESPERANTO/MMM-PublicTransportHub"
const DEFAULT_HAFAS_PROFILE = "db"
const DEFAULT_VENDO_PROFILE = "db"

function getUserInput(prompt = "Enter an address or station name: ") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function buildHeaders() {
  const contact = process.env.PTH_CONTACT || DEFAULT_CONTACT
  const userAgent
    = process.env.PTH_USER_AGENT || `MMM-PublicTransportHub/query (+${contact})`

  return {
    "User-Agent": userAgent,
  }
}

function buildClientUserAgent() {
  return process.env.PTH_USER_AGENT || "MMM-PublicTransportHub-query"
}

function parseProfileList(input, defaultProfile) {
  if (!input || input.length === 0) {
    return [defaultProfile]
  }

  return input
    .split(",")
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase()
}

function uniqueModes(stopTimes = []) {
  return [
    ...new Set(
      stopTimes
        .map(stopTime =>
          typeof stopTime.mode === "string"
            ? stopTime.mode.toLowerCase()
            : null,
        )
        .filter(Boolean),
    ),
  ]
}

function geocodeModes(location) {
  const modes = Array.isArray(location?.modes) ? location.modes : []
  const normalized = modes
    .map(mode => (typeof mode === "string" ? mode.toLowerCase() : null))
    .filter(Boolean)

  return [...new Set(normalized)]
}

async function loadStopModes({ baseUrl, headers, stopId }) {
  try {
    const response = await stoptimes({
      throwOnError: true,
      baseUrl,
      headers,
      query: {
        stopId,
        n: 30,
        withAlerts: false,
        fetchStops: false,
        time: new Date().toISOString(),
      },
    })

    const stopTimes = response?.data?.stopTimes || []
    const modes = uniqueModes(stopTimes)
    return modes.length > 0
      ? modes.join(", ")
      : "none detected in current departures"
  }
  catch {
    return "unknown (stoptimes lookup failed)"
  }
}

function locationName(location) {
  return (
    location.name
    || location.displayName
    || location.stopName
    || "(unnamed stop)"
  )
}

function locationStopId(location) {
  return location.stopId || location.id || ""
}

async function queryTransitous(searchText) {
  const baseUrl = process.env.PTH_BASE_URL || DEFAULT_BASE_URL
  const headers = buildHeaders()

  const response = await geocode({
    throwOnError: true,
    baseUrl,
    headers,
    query: {
      text: searchText,
      type: "STOP",
    },
  })

  const locations = (response?.data || [])
    .map(location => ({
      id: locationStopId(location),
      name: locationName(location),
      servedModes: geocodeModes(location),
    }))
    .filter(location => Boolean(location.id))
    .slice(0, 10)

  for (const location of locations.slice(0, 3)) {
    location.activeModes = await loadStopModes({
      baseUrl,
      headers,
      stopId: location.id,
    })
  }

  return locations
}

async function queryHafasLike({
  libraryName,
  profileName,
  searchText,
}) {
  const library = await import(libraryName)
  const { profile } = await import(`${libraryName}/p/${profileName}/index.js`)

  const client = library.createClient(profile, buildClientUserAgent())
  const response = await client.locations(searchText, {
    addresses: false,
    poi: false,
    results: 10,
    stations: true,
  })

  return (response || [])
    .map(location => ({
      id: String(location?.id || ""),
      name: String(location?.name || "(unnamed stop)"),
      products: Object.keys(location?.products || {}).filter(
        product => Boolean(location.products?.[product]),
      ),
    }))
    .filter(location => Boolean(location.id))
}

function printTransitousOverview(locations) {
  if (locations.length === 0) {
    console.info("Transitous: no stop results found.")
    return
  }

  console.info("Transitous top matches:")
  for (const location of locations.slice(0, 3)) {
    const servedModes
      = location.servedModes.length > 0 ? location.servedModes.join(", ") : "unknown"
    const activeModes = location.activeModes || "unknown"
    console.info(
      ` - ${location.name}\n`
      + `   ID: ${location.id}\n`
      + `   Served modes: ${servedModes}\n`
      + `   Active now: ${activeModes}`,
    )
  }
}

function printHafasLikeOverview(label, profileName, locations) {
  if (locations.length === 0) {
    console.info(`${label} (${profileName}): no stop results found.`)
    return
  }

  console.info(`${label} (${profileName}) top matches:`)
  for (const location of locations.slice(0, 3)) {
    const products
      = location.products.length > 0 ? location.products.join(", ") : "unknown"
    console.info(
      ` - ${location.name}\n`
      + `   ID: ${location.id}\n`
      + `   Products: ${products}`,
    )
  }
}

function printUsageGuide() {
  console.info("\n\nHow to use the station information:\n")
  console.info("1. Choose your preferred provider from the results above.")
  console.info("2. Add the station ID to your MMM-PublicTransportHub config:\n")
  console.info(
    "   {\n"
    + "     module: \"MMM-PublicTransportHub\",\n"
    + "     config: {\n"
    + "       provider: \"transitous\",  // or \"hafas\" or \"vendo\"\n"
    + "       stationId: \"<ID from above>\",\n"
    + "       hafasProfile: \"db\",       // only for provider: \"hafas\"\n"
    + "       vendoProfile: \"db\",       // only for provider: \"vendo\"\n"
    + "     }\n"
    + "   }\n",
  )
  console.info("3. Adjust other settings (maxDepartures, filters, etc.) as needed.")
  console.info("4. See README for all configuration options.\n")
}

async function main() {
  try {
    const stationName = await getUserInput()

    if (!stationName) {
      console.info("No station name entered. Exiting.")
      return
    }

    const useDefaultProfiles = await getUserInput(
      `Use default profiles (HAFAS: ${DEFAULT_HAFAS_PROFILE}, Vendo: ${DEFAULT_VENDO_PROFILE})? (y/n): `,
    )
    const isDefault = normalizeText(useDefaultProfiles).startsWith("y")

    let hafasProfiles = [DEFAULT_HAFAS_PROFILE]
    let vendoProfiles = [DEFAULT_VENDO_PROFILE]

    if (!isDefault) {
      const hafasInput = await getUserInput(
        "Enter HAFAS profile(s) (comma-separated, e.g. 'db,insa,vbb'): ",
      )
      const vendoInput = await getUserInput(
        "Enter Vendo profile(s) (comma-separated, or empty for default): ",
      )

      hafasProfiles = parseProfileList(hafasInput, DEFAULT_HAFAS_PROFILE)
      vendoProfiles = parseProfileList(vendoInput, DEFAULT_VENDO_PROFILE)
    }

    console.info(`\nSearching providers for '${stationName}'...\n`)

    const hafasQueries = hafasProfiles.map(profile =>
      queryHafasLike({
        libraryName: "hafas-client",
        profileName: profile,
        searchText: stationName,
      }),
    )

    const vendoQueries = vendoProfiles.map(profile =>
      queryHafasLike({
        libraryName: "db-vendo-client",
        profileName: profile,
        searchText: stationName,
      }),
    )

    const allResults = await Promise.allSettled([
      queryTransitous(stationName),
      ...hafasQueries,
      ...vendoQueries,
    ])

    const transitousResult = allResults[0]
    const hafasResults = allResults.slice(1, 1 + hafasProfiles.length)
    const vendoResults = allResults.slice(1 + hafasProfiles.length)

    const transitousLocations
      = transitousResult.status === "fulfilled" ? transitousResult.value : []

    printTransitousOverview(transitousLocations)

    for (let i = 0; i < hafasProfiles.length; i++) {
      const result = hafasResults[i]
      const locations
        = result.status === "fulfilled" ? result.value : []
      console.info("")
      printHafasLikeOverview("HAFAS", hafasProfiles[i], locations)

      if (result.status === "rejected") {
        console.info(`  Error: ${result.reason?.message || result.reason}`)
      }
    }

    for (let i = 0; i < vendoProfiles.length; i++) {
      const result = vendoResults[i]
      const locations
        = result.status === "fulfilled" ? result.value : []
      console.info("")
      printHafasLikeOverview("Vendo", vendoProfiles[i], locations)

      if (result.status === "rejected") {
        console.info(`  Error: ${result.reason?.message || result.reason}`)
      }
    }

    if (transitousResult.status === "rejected") {
      console.info(
        `\nTransitous query failed: ${transitousResult.reason?.message || transitousResult.reason}`,
      )
    }

    printUsageGuide()
  }
  catch (error) {
    console.error(
      `\nError occurred while searching: ${error?.message || error}\n`,
    )
    process.exitCode = 1
  }
}

main()
