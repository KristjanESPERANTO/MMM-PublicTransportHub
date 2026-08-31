import * as readline from "node:readline"
import process from "node:process"
import { geocode, stoptimes } from "@motis-project/motis-client"

const DEFAULT_BASE_URL = "https://api.transitous.org"
const DEFAULT_CONTACT
  = "https://github.com/KristjanESPERANTO/MMM-PublicTransportHub"

function getUserInput(prompt = "Station or address to search (e.g. 'Gotha Hbf'): ") {
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

function errorMessage(error) {
  if (typeof error === "string" && error.trim() !== "") {
    return error
  }

  return error?.message || error?.error || String(error)
}

function parseProfileList(input, defaultProfile) {
  if (!input || input.length === 0) {
    return defaultProfile ? [defaultProfile] : []
  }

  return input
    .split(",")
    .map(p => p.trim())
    .filter(p => p.length > 0)
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

  const modeResults = await Promise.all(
    locations.slice(0, 3).map(location =>
      loadStopModes({
        baseUrl,
        headers,
        stopId: location.id,
      }),
    ),
  )
  modeResults.forEach((activeModes, index) => {
    locations[index].activeModes = activeModes
  })

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

function printUsageGuide({ provider, stationId, hafasProfile, vendoProfile }) {
  console.info("\n\nConfig for the selected station:\n")
  console.info("Copy this block into your MagicMirror config:\n")
  console.info(
    "   {\n"
    + "     module: \"MMM-PublicTransportHub\",\n"
    + "     position: \"bottom_left\",\n"
    + "     config: {\n"
    + `       provider: "${provider}",\n`
    + `       stationId: "${stationId}",\n`
    + (provider === "transitous"
      ? "       contact: \"______YOUR_EMAIL_OR_FORUM_ALIAS______\",\n"
      : "")
    + (provider === "hafas" ? `       hafasProfile: "${hafasProfile}",\n` : "")
    + (provider === "vendo" ? `       vendoProfile: "${vendoProfile}",\n` : "")
    + "     }\n"
    + "   },\n",
  )
  console.info("Adjust other settings (maxDepartures, filters, etc.) as needed.")
  console.info("See README for all configuration options.\n")
}

function printCandidateSelection(candidates) {
  console.info("\nAvailable station results:\n")
  candidates.forEach((candidate, index) => {
    const provider = candidate.provider[0].toUpperCase()
      + candidate.provider.slice(1)
    const profile = candidate.profile ? ` / profile: ${candidate.profile}` : ""
    console.info(
      ` [${index + 1}] ${candidate.location.name}\n`
      + `     Provider: ${provider}${profile}\n`
      + `     Station ID: ${candidate.location.id}`,
    )
  })
  console.info("\nEnter a result number to generate its config, or press Enter to quit.")
}

async function selectCandidate(candidates) {
  while (true) {
    const selection = await getUserInput(
      "Enter result number, or press Enter to quit: ",
    )
    if (!selection) {
      return null
    }

    if (!/^\d+$/.test(selection)) {
      console.info("Please enter one of the displayed result numbers.")
      continue
    }

    const candidate = candidates[Number(selection) - 1]
    if (candidate) {
      return candidate
    }

    console.info(
      `Please enter a number between 1 and ${candidates.length}.`,
    )
  }
}

async function main() {
  try {
    const stationName = await getUserInput()

    if (!stationName) {
      console.info("No station name entered. Exiting.")
      return
    }

    console.info(
      "Transitous is always queried. HAFAS and Vendo are optional; press Enter to skip either one.",
    )
    const hafasInput = await getUserInput(
      "Optional HAFAS profile(s), comma-separated (e.g. 'vmt,insa,vbb'; Enter to skip): ",
    )
    const vendoInput = await getUserInput(
      "Optional Vendo profile(s), comma-separated (e.g. 'db'; Enter to skip): ",
    )

    const hafasProfiles = parseProfileList(hafasInput, "")
    const vendoProfiles = parseProfileList(vendoInput, "")

    const selectedProfiles = [
      "Transitous",
      ...hafasProfiles.map(profile => `HAFAS (${profile})`),
      ...vendoProfiles.map(profile => `Vendo (${profile})`),
    ]
    console.info(
      `\nSearching '${stationName}' with ${selectedProfiles.join(", ")}...\n`,
    )

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
    const candidates = transitousLocations.slice(0, 3).map(location => ({
      location,
      provider: "transitous",
    }))

    printTransitousOverview(transitousLocations)

    for (let i = 0; i < hafasProfiles.length; i++) {
      const result = hafasResults[i]
      const locations
        = result.status === "fulfilled" ? result.value : []
      candidates.push(...locations.slice(0, 3).map(location => ({
        location,
        profile: hafasProfiles[i],
        provider: "hafas",
      })))
      console.info("")
      printHafasLikeOverview("HAFAS", hafasProfiles[i], locations)

      if (result.status === "rejected") {
        console.info(`  Error: ${errorMessage(result.reason)}`)
      }
    }

    for (let i = 0; i < vendoProfiles.length; i++) {
      const result = vendoResults[i]
      const locations
        = result.status === "fulfilled" ? result.value : []
      candidates.push(...locations.slice(0, 3).map(location => ({
        location,
        profile: vendoProfiles[i],
        provider: "vendo",
      })))
      console.info("")
      printHafasLikeOverview("Vendo", vendoProfiles[i], locations)

      if (result.status === "rejected") {
        console.info(`  Error: ${errorMessage(result.reason)}`)
      }
    }

    if (transitousResult.status === "rejected") {
      console.info(
        `\nTransitous query failed: ${errorMessage(transitousResult.reason)}`,
      )
    }

    if (candidates.length === 0) {
      console.info("\nNo station results are available to configure.\n")
      return
    }

    printCandidateSelection(candidates)
    const selectedCandidate = await selectCandidate(candidates)
    if (!selectedCandidate) {
      console.info("No station result selected. Exiting.")
      return
    }

    printUsageGuide({
      provider: selectedCandidate.provider,
      stationId: selectedCandidate.location.id,
      hafasProfile: selectedCandidate.profile,
      vendoProfile: selectedCandidate.profile,
    })
  }
  catch (error) {
    console.error(
      `\nError occurred while searching: ${errorMessage(error)}\n`,
    )
    process.exitCode = 1
  }
}

main()
