import http from "node:http"
import process from "node:process"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { geocode, stoptimes } from "@motis-project/motis-client"
import { createProvider } from "../core/ProviderFactory.mjs"

const require = createRequire(import.meta.url)
const DEFAULT_BASE_URL = "https://api.transitous.org"
const DEFAULT_CONTACT
  = "https://github.com/KristjanESPERANTO/MMM-PublicTransportHub"
const HOST = "127.0.0.1"
const DEFAULT_PORT = 8765
const PORT = Number(process.env.PTH_QUERY_PORT || DEFAULT_PORT)
const MAX_BODY_BYTES = 1_000_000

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PTH_QUERY_PORT must be an integer between 1 and 65535")
}

function listProfiles(libraryName) {
  try {
    const packageRoot = path.dirname(require.resolve(libraryName))
    return fs
      .readdirSync(path.join(packageRoot, "p"), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  }
  catch {
    return []
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function buildProfileOptions(profiles, selectedProfile, names = {}) {
  return profiles
    .map((profile) => {
      const label = names[profile] ? `${profile} - ${names[profile]}` : profile
      return `<option value="${escapeHtml(profile)}"${profile === selectedProfile ? " selected" : ""}>${escapeHtml(label)}</option>`
    })
    .join("\n      ")
}

const HAFAS_PROFILE_NAMES = {
  "avv": "Aachener Verkehrsverbund",
  "bart": "Bay Area Rapid Transit",
  "bls": "BLS AG",
  "bvg": "Berliner Verkehrsbetriebe",
  "cfl": "Société Nationale des Chemins de Fer Luxembourgeois",
  "cmta": "Capital Metropolitan Transportation Authority",
  "dart": "Des Moines Area Regional Transit Authority",
  "db": "Deutsche Bahn",
  "db-busradar-nrw": "DB Busradar NRW",
  "insa": "Nahverkehr Sachsen-Anhalt / INSA",
  "invg": "Ingolstädter Verkehrsgesellschaft",
  "irish-rail": "Iarnród Éireann / Irish Rail",
  "ivb": "Innsbrucker Verkehrsbetriebe",
  "kvb": "Kölner Verkehrs-Betriebe",
  "mobil-nrw": "mobil.nrw",
  "mobiliteit-lu": "Mobilitéitszentral Luxembourg",
  "nahsh": "Nahverkehrsverbund Schleswig-Holstein",
  "nvv": "Nordhessischer Verkehrsverbund",
  "oebb": "Österreichische Bundesbahnen",
  "ooevv": "Oberösterreichischer Verkehrsverbund",
  "pkp": "Polskie Koleje Państwowe",
  "rejseplanen": "Rejseplanen Denmark",
  "rmv": "Rhein-Main-Verkehrsverbund",
  "rsag": "Rostocker Straßenbahn AG",
  "saarfahrplan": "Saarfahrplan / VGS",
  "salzburg": "Salzburg",
  "sbahn-muenchen": "S-Bahn München",
  "sncb": "Belgian National Railways",
  "stv": "Steirischer Verkehrsverbund",
  "svv": "Salzburger Verkehrsverbund",
  "tpg": "Transports publics genevois",
  "vbb": "Verkehrsverbund Berlin-Brandenburg",
  "vbn": "Verkehrsverbund Bremen/Niedersachsen",
  "vkg": "Verkehrsverbund Kärnten",
  "vmt": "Verkehrsverbund Mittelthüringen",
  "vor": "Verkehrsverbund Ost-Region",
  "vos": "Verkehrsgemeinschaft Osnabrück",
  "vrn": "Verkehrsverbund Rhein-Neckar",
  "vsn": "Verkehrsverbund Süd-Niedersachsen",
  "vvt": "Verkehrsverbund Tirol",
  "vvv": "Verkehrsverbund Vorarlberg",
  "zvv": "Zürcher Verkehrsverbund",
}

const VENDO_PROFILE_NAMES = {
  db: "Deutsche Bahn (default)",
  dbbahnhof: "DB Bahnhof live",
  dbnav: "DB Navigator app",
  dbregioguide: "DB RegioGuide",
  dbris: "DB Reisendeninformationssystem (RIS)",
  dbweb: "DB bahn.de website",
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

async function queryPlk(searchText, apiKey) {
  const url = new URL("https://pdp-api.plk-sa.pl/api/v1/dictionaries/stations")
  url.searchParams.set("search", searchText)

  const response = await fetch(url, {
    headers: { "X-API-Key": apiKey },
  })

  if (!response.ok) {
    let details = ""
    try {
      const errorBody = await response.json()
      details = errorBody?.message || errorBody?.error || ""
    }
    catch {
      // Response body wasn't JSON, ignore and use the status text instead.
    }

    throw new Error(
      `PLK API request failed with status ${response.status}${details ? `: ${details}` : ""}`,
    )
  }

  const body = await response.json()
  return (body?.stations || [])
    .map(station => ({
      id: String(station?.id ?? ""),
      name: String(station?.name || "(unnamed stop)"),
    }))
    .filter(location => Boolean(location.id))
    .slice(0, 10)
}

async function performSearch({
  stationName,
  providers,
  hafasProfiles,
  vendoProfiles,
  plkApiKey,
} = {}) {
  const stationText = String(stationName || "").trim()
  if (!stationText) {
    throw new Error("Station name is required")
  }

  const selected = Array.isArray(providers)
    ? providers.map(p => String(p).toLowerCase())
    : []

  const hafasList = selected.includes("hafas")
    ? parseProfileList(hafasProfiles, "db")
    : []
  const vendoList = selected.includes("vendo")
    ? parseProfileList(vendoProfiles, "db")
    : []
  const plkKey = selected.includes("plk") ? String(plkApiKey || "").trim() : ""

  const jobs = []

  if (selected.includes("transitous")) {
    jobs.push({ provider: "transitous", promise: queryTransitous(stationText) })
  }

  for (const profile of hafasList) {
    jobs.push({
      provider: "hafas",
      profile,
      promise: queryHafasLike({
        libraryName: "hafas-client",
        profileName: profile,
        searchText: stationText,
      }),
    })
  }

  for (const profile of vendoList) {
    jobs.push({
      provider: "vendo",
      profile,
      promise: queryHafasLike({
        libraryName: "db-vendo-client",
        profileName: profile,
        searchText: stationText,
      }),
    })
  }

  if (plkKey) {
    jobs.push({ provider: "plk", promise: queryPlk(stationText, plkKey) })
  }

  if (jobs.length === 0) {
    throw new Error("Select at least one provider")
  }

  const settled = await Promise.allSettled(jobs.map(job => job.promise))

  return {
    results: jobs.map((job, index) => {
      const outcome = settled[index]
      return {
        provider: job.provider,
        profile: job.profile || null,
        status: outcome.status,
        locations: outcome.status === "fulfilled" ? outcome.value : [],
        error: outcome.status === "rejected" ? errorMessage(outcome.reason) : null,
      }
    }),
  }
}

async function fetchTestDepartures({
  provider,
  stationId,
  hafasProfile,
  vendoProfile,
  contact,
  apiKey,
} = {}) {
  if (!provider || !stationId) {
    throw new Error("provider and stationId are required")
  }

  const config = {
    provider,
    stationId,
    maxDepartures: 10,
  }
  if (hafasProfile) {
    config.hafasProfile = hafasProfile
  }
  if (vendoProfile) {
    config.vendoProfile = vendoProfile
  }
  if (contact) {
    config.contact = contact
  }
  if (apiKey) {
    config.apiKey = apiKey
  }

  const providerInstance = await createProvider(config)
  return providerInstance.fetchDepartures()
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""

    req.on("data", (chunk) => {
      data += chunk
      if (data.length > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"))
        req.destroy()
      }
    })

    req.on("end", () => {
      if (!data) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(data))
      }
      catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`))
      }
    })

    req.on("error", reject)
  })
}

const HAFAS_PROFILE_OPTIONS = buildProfileOptions(listProfiles("hafas-client"), "db", HAFAS_PROFILE_NAMES)
const VENDO_PROFILE_OPTIONS = buildProfileOptions(listProfiles("db-vendo-client"), "db", VENDO_PROFILE_NAMES)

const HTML_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MMM-PublicTransportHub - Station Query</title>
<style>
  :root { color-scheme: dark light; --accent: #168c8c; --success: #3c8f5a; --accent-soft: color-mix(in srgb, var(--accent) 14%, transparent); --border: #8888; }
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem 4rem; }
  h1 { margin-bottom: 0.5rem; }
  h2 { margin-top: 0; }
  .intro { max-width: 58ch; line-height: 1.5; }
  .steps { display: grid; gap: 1rem; margin: 2rem 0; }
  .step, .selected-section { border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
  .selected-section { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .step-heading { display: flex; gap: 0.75rem; align-items: flex-start; }
  .step-number { flex: 0 0 1.7rem; height: 1.7rem; line-height: 1.7rem; border-radius: 50%; text-align: center; background: var(--accent); color: white; font-weight: 700; }
  .step-heading h2 { margin: 0; font-size: 1.1rem; }
  .step-heading p { margin: 0.2rem 0 0; }
  .step-body { margin-left: 2.45rem; }
  label { display: block; margin: 0.5rem 0 0.25rem; }
  input[type="text"], input[type="password"], select[multiple] { width: 100%; padding: 0.4rem; box-sizing: border-box; }
  .provider-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0 0.25rem; }
  .provider-row label { display: inline; margin: 0; }
  .provider-options { margin-left: 1.5rem; margin-bottom: 0.75rem; }
  button { padding: 0.5rem 1rem; cursor: pointer; border: 1px solid var(--border); border-radius: 5px; background: transparent; color: inherit; }
  button:hover { border-color: var(--accent); }
  button.primary { font-weight: 700; border-color: var(--accent); background: var(--accent); color: white; }
  button.select-station { border-color: var(--success); background: var(--success); color: white; }
  button.select-station:hover { border-color: var(--success); filter: brightness(1.08); }
  button:disabled { cursor: wait; opacity: 0.65; }
  .button-spinner { display: inline-block; width: 0.85em; height: 0.85em; margin-right: 0.45em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -0.1em; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .result-group { margin-bottom: 1.5rem; }
  .result-group h2 { font-size: 1rem; margin: 0 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid #8888; }
  .result-count { font-weight: normal; opacity: 0.7; font-size: 0.85em; margin-left: 0.4rem; }
  .result-card { border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; margin: 0.5rem 0; }
  .result-card:has(button:focus-visible) { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .result-card h3 { margin: 0 0 0.25rem; }
  .result-card .meta-line { opacity: 0.7; font-size: 0.9em; }
  .result-card .station-id { display: block; margin: 0.4rem 0 0.65rem; font-size: 0.8em; opacity: 0.7; }
  .result-card code { font-family: ui-monospace, monospace; }
  .meta-label { display: block; margin-bottom: 0.2rem; font-size: 0.75em; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.65; }
  .mode-list { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.55rem; }
  .mode-chip { display: inline-block; padding: 0.18rem 0.45rem; border: 1px solid var(--border); border-radius: 999px; font-size: 0.78em; }
  .mode-chip.active { border-color: var(--accent); background: var(--accent-soft); }
  .muted { opacity: 0.7; font-size: 0.9em; }
  .error { color: #d33; }
  .selected-section { margin-top: 2rem; }
  .selected-name { font-size: 1.25rem; font-weight: 700; margin: 0.25rem 0; }
  .selected-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
  .test-panel { border-top: 1px solid var(--border); margin-top: 1rem; padding-top: 1rem; }
  .test-panel h3 { margin: 0; }
  .departure-table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
  .departure-table th, .departure-table td { text-align: left; padding: 0.35rem 0.75rem 0.35rem 0; }
  .departure-table th { font-size: 0.85em; opacity: 0.7; }
  pre { white-space: pre-wrap; background: var(--accent-soft); border-left: 3px solid var(--accent); padding: 0.75rem; border-radius: 0 5px 5px 0; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
  <h1>Find a station for MMM-PublicTransportHub</h1>
  <p class="intro muted">Search for a station, choose the exact provider result, then copy a ready-to-paste config. You can optionally check live departures before adding it to MagicMirror.</p>

  <div class="steps">
    <section class="step">
      <div class="step-heading">
        <span class="step-number">1</span>
        <div>
          <h2>Search for a station</h2>
          <p class="muted">Choose one or more providers. Different providers may use different station IDs.</p>
        </div>
      </div>
      <div class="step-body">
        <form id="search-form">
          <label for="station">Station or address</label>
          <input type="text" id="station" name="station" placeholder="e.g. Gotha Hbf" required autofocus />

          <div class="provider-row">
            <input type="checkbox" id="p-transitous" checked />
            <label for="p-transitous">Transitous</label>
          </div>
          <div class="provider-options" id="transitous-options">
            <label for="transitous-contact">Contact (email or MagicMirror forum alias)</label>
            <input type="text" id="transitous-contact" placeholder="you@example.com or forum alias" />
            <p class="muted">Transitous uses this to identify your requests. It is included in the generated config.</p>
          </div>

          <div class="provider-row">
            <input type="checkbox" id="p-hafas" />
            <label for="p-hafas">HAFAS</label>
          </div>
          <div class="provider-options" id="hafas-options" hidden>
            <label for="hafas-profiles">Profile(s)</label>
            <select id="hafas-profiles" multiple size="6">
            ${HAFAS_PROFILE_OPTIONS}
            </select>
            <p class="muted">Select one profile for a normal lookup. Use Ctrl/Cmd-click only when comparing several networks.</p>
          </div>

          <div class="provider-row">
            <input type="checkbox" id="p-vendo" />
            <label for="p-vendo">Vendo</label>
          </div>
          <div class="provider-options" id="vendo-options" hidden>
            <label for="vendo-profiles">Profile(s)</label>
            <select id="vendo-profiles" multiple size="6">
            ${VENDO_PROFILE_OPTIONS}
            </select>
            <p class="muted">Select one profile for a normal lookup. Use multiple profiles only to compare results.</p>
          </div>

          <div class="provider-row">
            <input type="checkbox" id="p-plk" />
            <label for="p-plk">PLK (Poland)</label>
          </div>
          <div class="provider-options" id="plk-options" hidden>
            <label for="plk-key">API key</label>
            <input type="password" id="plk-key" autocomplete="off" />
            <p class="muted">PLK searches the beginning of the name and is sensitive to Polish letters, for example Wrocław.</p>
          </div>

          <p><button id="search-button" class="primary" type="submit"><span id="search-button-spinner" class="button-spinner" hidden aria-hidden="true"></span><span id="search-button-label">Search stations</span></button></p>
        </form>
      </div>
    </section>
  </div>

  <section id="results-section" class="step" hidden>
    <div class="step-heading">
      <span class="step-number">2</span>
      <div>
        <h2>Choose the exact station</h2>
        <p class="muted">Names can appear more than once. Check the provider, ID and modes before selecting one. Mode chips reflect the current departure query, not necessarily realtime data.</p>
      </div>
    </div>
    <div class="step-body">
      <div id="status" class="muted"></div>
      <div id="results"></div>
    </div>
  </section>
  <section id="selected-section" class="selected-section" hidden>
    <div class="step-heading">
      <span class="step-number">3</span>
      <div>
        <h2>Use this station</h2>
        <p class="muted">Confirm the match, test live data if needed, and copy the config below.</p>
      </div>
    </div>
    <div class="step-body">
      <p id="selected-name" class="selected-name"></p>
      <p id="selected-details" class="muted"></p>
      <div class="selected-actions">
        <button id="test-departures-button" class="primary" type="button">Test live departures</button>
      </div>
      <div id="departures-test-status" class="muted"></div>
      <div id="departures-test-output"></div>
      <div id="config-section">
        <h3>3. Copy the config</h3>
        <p class="muted">This is the minimal config for this station. Copy it first; add optional filters or limits later if you need them.</p>
        <pre id="config-output"></pre>
        <button id="copy-config-button" type="button">Copy config</button>
      </div>
    </div>
  </section>

<script>
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("search-form")
    var statusEl = document.getElementById("status")
    var resultsEl = document.getElementById("results")
    var resultsSection = document.getElementById("results-section")
    var searchButton = document.getElementById("search-button")
    var searchButtonLabel = document.getElementById("search-button-label")
    var searchButtonSpinner = document.getElementById("search-button-spinner")
    var selectedSection = document.getElementById("selected-section")
    var selectedName = document.getElementById("selected-name")
    var selectedDetails = document.getElementById("selected-details")
    var configSection = document.getElementById("config-section")
    var configOutput = document.getElementById("config-output")
    var copyConfigButton = document.getElementById("copy-config-button")
    var testButton = document.getElementById("test-departures-button")
    var testStatus = document.getElementById("departures-test-status")
    var testOutput = document.getElementById("departures-test-output")
    var currentSelection = null

    function toggle(checkboxId, optionsId) {
      var checkbox = document.getElementById(checkboxId)
      var options = document.getElementById(optionsId)
      checkbox.addEventListener("change", function () {
        options.hidden = !checkbox.checked
      })
    }
    toggle("p-transitous", "transitous-options")
    toggle("p-hafas", "hafas-options")
    toggle("p-vendo", "vendo-options")
    toggle("p-plk", "plk-options")

    function providerLabel(provider) {
      if (provider === "plk") {
        return "PLK"
      }
      return provider.charAt(0).toUpperCase() + provider.slice(1)
    }

    function getSelectedOptionValues(id) {
      var select = document.getElementById(id)
      return Array.prototype.map.call(select.selectedOptions, function (option) {
        return option.value
      })
    }

    function setSearchLoading(isLoading, profileCount) {
      searchButton.disabled = isLoading
      searchButtonSpinner.hidden = !isLoading
      searchButton.setAttribute("aria-busy", String(isLoading))
      searchButtonLabel.textContent = isLoading
        ? "Searching" + (profileCount > 1 ? " " + profileCount + " profiles" : "") + "..."
        : "Search stations"
    }

    function buildConfig(entry, location, contact, plkKey) {
      var lines = []
      lines.push("{")
      lines.push("  module: " + JSON.stringify("MMM-PublicTransportHub") + ",")
      lines.push("  position: " + JSON.stringify("bottom_left") + ",")
      lines.push("  config: {")
      lines.push("    provider: " + JSON.stringify(entry.provider) + ",")
      lines.push("    stationId: " + JSON.stringify(location.id) + ",")
      if (entry.provider === "transitous") {
        lines.push("    contact: " + JSON.stringify(contact || "______YOUR_EMAIL_OR_FORUM_ALIAS______") + ",")
      }
      if (entry.provider === "hafas") {
        lines.push("    hafasProfile: " + JSON.stringify(entry.profile) + ",")
      }
      if (entry.provider === "vendo") {
        lines.push("    vendoProfile: " + JSON.stringify(entry.profile) + ",")
      }
      if (entry.provider === "plk") {
        lines.push("    apiKey: " + JSON.stringify(plkKey || "______YOUR_PLK_API_KEY______") + ",")
      }
      lines.push("  },")
      lines.push("},")
      return lines.join("\n")
    }

    function refreshConfig() {
      if (!currentSelection) return
      configOutput.textContent = buildConfig(
        { provider: currentSelection.provider, profile: currentSelection.profile },
        { id: currentSelection.stationId, name: currentSelection.name },
        document.getElementById("transitous-contact").value.trim(),
        document.getElementById("plk-key").value.trim(),
      )
    }

    document.getElementById("transitous-contact").addEventListener("input", refreshConfig)
    document.getElementById("plk-key").addEventListener("input", refreshConfig)

    function renderResults(data) {
      resultsEl.innerHTML = ""
      var anyResults = false

      data.results.forEach(function (entry) {
        var heading = providerLabel(entry.provider) + (entry.profile ? " (" + entry.profile + ")" : "")

        var group = document.createElement("section")
        group.className = "result-group"

        var groupTitle = document.createElement("h2")
        groupTitle.textContent = heading
        group.appendChild(groupTitle)

        if (entry.status === "rejected") {
          var errBox = document.createElement("p")
          errBox.className = "error"
          errBox.textContent = "Failed: " + entry.error
          group.appendChild(errBox)
          resultsEl.appendChild(group)
          return
        }

        if (entry.locations.length === 0) {
          var emptyBox = document.createElement("p")
          emptyBox.className = "muted"
          emptyBox.textContent = "No results found."
            + (entry.provider === "plk"
              ? " PLK matches only the beginning of a station name and is sensitive to Polish letters, e.g. Wrocław."
              : "")
          group.appendChild(emptyBox)
          resultsEl.appendChild(group)
          return
        }

        var countBadge = document.createElement("span")
        countBadge.className = "result-count"
        var shown = Math.min(entry.locations.length, 5)
        countBadge.textContent = shown === entry.locations.length
          ? "(" + entry.locations.length + " result" + (entry.locations.length === 1 ? "" : "s") + ")"
          : "(showing " + shown + " of " + entry.locations.length + ")"
        groupTitle.appendChild(countBadge)

        entry.locations.slice(0, 5).forEach(function (location) {
          anyResults = true
          var card = document.createElement("div")
          card.className = "result-card"

          var title = document.createElement("h3")
          title.textContent = location.name
          card.appendChild(title)

          var stationId = document.createElement("code")
          stationId.className = "station-id"
          stationId.textContent = "ID: " + location.id
          card.appendChild(stationId)

          function addModeGroup(label, modes, active) {
            if (!modes || modes.length === 0) return
            var group = document.createElement("div")
            var groupLabel = document.createElement("span")
            groupLabel.className = "meta-label"
            groupLabel.textContent = label
            group.appendChild(groupLabel)
            var modeList = document.createElement("div")
            modeList.className = "mode-list"
            modes.forEach(function (mode) {
              var chip = document.createElement("span")
              chip.className = "mode-chip" + (active ? " active" : "")
              chip.textContent = mode.replaceAll("_", " ")
              modeList.appendChild(chip)
            })
            group.appendChild(modeList)
            card.appendChild(group)
          }

          addModeGroup("Served modes", location.servedModes)
          addModeGroup(
            "Modes in current departures",
            location.activeModes && !location.activeModes.startsWith("none detected")
              ? location.activeModes.split(", ").filter(Boolean)
              : [],
            true,
          )
          addModeGroup("Products", location.products)

          var useButton = document.createElement("button")
          useButton.type = "button"
          useButton.className = "select-station"
          useButton.textContent = "Select this station"
          useButton.addEventListener("click", function () {
            currentSelection = {
              provider: entry.provider,
              profile: entry.profile,
              stationId: location.id,
              name: location.name,
            }
            selectedName.textContent = location.name
            selectedDetails.textContent = providerLabel(entry.provider)
              + (entry.profile ? " - " + entry.profile : "")
              + " - ID: " + location.id
            refreshConfig()
            selectedSection.hidden = false
            testStatus.textContent = "Ready to test"
            testOutput.innerHTML = ""
            requestAnimationFrame(function () {
              selectedSection.scrollIntoView({ behavior: "smooth", block: "start" })
            })
          })
          card.appendChild(useButton)

          group.appendChild(card)
        })

        resultsEl.appendChild(group)
      })

      if (!anyResults) {
        var noneBox = document.createElement("p")
        noneBox.className = "muted"
        noneBox.textContent = "No station results found for any selected provider."
        resultsEl.appendChild(noneBox)
      }
    }

    function renderDeparturesTable(departures) {
      testOutput.innerHTML = ""

      if (!departures || departures.length === 0) {
        var emptyMsg = document.createElement("p")
        emptyMsg.className = "muted"
        emptyMsg.textContent = "No departures returned."
        testOutput.appendChild(emptyMsg)
        return
      }

      var table = document.createElement("table")
      table.className = "departure-table"

      var headerRow = document.createElement("tr")
      ;["Time", "Line", "Direction", "Platform"].forEach(function (label) {
        var th = document.createElement("th")
        th.textContent = label
        th.style.textAlign = "left"
        th.style.padding = "0.25rem 0.75rem 0.25rem 0"
        headerRow.appendChild(th)
      })
      table.appendChild(headerRow)

      departures.forEach(function (dep) {
        var row = document.createElement("tr")

        var delaySuffix = ""
        if (typeof dep.delay === "number" && dep.delay !== 0) {
          var delayMinutes = Math.round(dep.delay / 60)
          delaySuffix = " (" + (delayMinutes > 0 ? "+" : "") + delayMinutes + ")"
        }

        var timeCell = document.createElement("td")
        timeCell.textContent = (dep.when || "--:--") + delaySuffix + (dep.canceled ? " X" : "")

        var lineCell = document.createElement("td")
        lineCell.textContent = (dep.line && dep.line.name) || "?"

        var directionCell = document.createElement("td")
        directionCell.textContent = dep.direction || "?"

        var platformCell = document.createElement("td")
        platformCell.textContent = dep.platform || "-"

        var cells = [timeCell, lineCell, directionCell, platformCell]
        cells.forEach(function (cell) {
          cell.style.padding = "0.25rem 0.75rem 0.25rem 0"
          row.appendChild(cell)
        })

        table.appendChild(row)
      })

      testOutput.appendChild(table)
    }

    testButton.addEventListener("click", function () {
      if (!currentSelection) {
        testStatus.textContent = "Select a station above first."
        return
      }

      testStatus.textContent = "Fetching departures..."
      testOutput.innerHTML = ""

      var payload = {
        provider: currentSelection.provider,
        stationId: currentSelection.stationId,
      }
      if (currentSelection.provider === "hafas") {
        payload.hafasProfile = currentSelection.profile
      }
      if (currentSelection.provider === "vendo") {
        payload.vendoProfile = currentSelection.profile
      }
      if (currentSelection.provider === "transitous") {
        payload.contact = document.getElementById("transitous-contact").value.trim()
      }
      if (currentSelection.provider === "plk") {
        payload.apiKey = document.getElementById("plk-key").value.trim()
      }

      fetch("/api/departures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (body) {
              throw new Error(body.error || ("Request failed with status " + response.status))
            })
          }
          return response.json()
        })
        .then(function (data) {
          var departures = data.departures || []
          testStatus.textContent = departures.length + " departure(s)"
          renderDeparturesTable(departures)
          requestAnimationFrame(function () {
            var outputTop = testOutput.getBoundingClientRect().top + window.scrollY
            window.scrollTo(0, Math.max(0, outputTop - 80))
          })
        })
        .catch(function (error) {
          testStatus.textContent = "Error: " + error.message
        })
    })

    form.addEventListener("submit", function (event) {
      event.preventDefault()

      var providers = []
      if (document.getElementById("p-transitous").checked) providers.push("transitous")
      if (document.getElementById("p-hafas").checked) providers.push("hafas")
      if (document.getElementById("p-vendo").checked) providers.push("vendo")
      if (document.getElementById("p-plk").checked) providers.push("plk")

      if (providers.length === 0) {
        statusEl.textContent = "Select at least one provider."
        return
      }

      statusEl.textContent = "Searching..."
      var selectedProfileCount = getSelectedOptionValues("hafas-profiles").length
        + getSelectedOptionValues("vendo-profiles").length
      setSearchLoading(true, selectedProfileCount)
      resultsEl.innerHTML = ""
      resultsSection.hidden = false
      selectedSection.hidden = true
      currentSelection = null

      fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationName: document.getElementById("station").value,
          providers: providers,
          hafasProfiles: getSelectedOptionValues("hafas-profiles").join(","),
          vendoProfiles: getSelectedOptionValues("vendo-profiles").join(","),
          plkApiKey: document.getElementById("plk-key").value,
        }),
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (body) {
              throw new Error(body.error || ("Request failed with status " + response.status))
            })
          }
          return response.json()
        })
        .then(function (data) {
          setSearchLoading(false, 0)
          statusEl.textContent = ""
          renderResults(data)
        })
        .catch(function (error) {
          setSearchLoading(false, 0)
          statusEl.textContent = "Error: " + error.message
        })
    })

    copyConfigButton.addEventListener("click", function () {
      navigator.clipboard.writeText(configOutput.textContent).then(function () {
        copyConfigButton.textContent = "Copied"
        setTimeout(function () {
          copyConfigButton.textContent = "Copy config"
        }, 1500)
      }).catch(function () {
        copyConfigButton.textContent = "Select the config text manually"
      })
    })
  })
</script>
</body>
</html>
`

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(HTML_PAGE)
      return
    }

    if (req.method === "POST" && url.pathname === "/api/search") {
      const body = await readJsonBody(req)
      const result = await performSearch(body)
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(result))
      return
    }

    if (req.method === "POST" && url.pathname === "/api/departures") {
      const body = await readJsonBody(req)
      const departures = await fetchTestDepartures(body)
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify({ departures }))
      return
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("Not found")
  }
  catch (error) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" })
    res.end(JSON.stringify({ error: errorMessage(error) }))
  }
})

server.listen(PORT, HOST, () => {
  console.info(`Station query tool running at http://${HOST}:${PORT}/`)
  console.info("Open that URL in your browser. Press Ctrl+C to stop.")
})
