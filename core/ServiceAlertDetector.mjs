function toTimestamp(value) {
  if (!value) {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function getDepartureIdentity(departure) {
  if (departure?.tripId) {
    return String(departure.tripId)
  }

  return [
    departure?.line?.id || departure?.line?.name || "unknown",
    departure?.rawPlannedWhen || departure?.rawWhen || "unknown",
    departure?.direction || "unknown",
  ].join("-")
}

function getLineName(departure) {
  return departure?.line?.name || departure?.line?.id || "Unknown line"
}

function getDepartureTimeLabel(departure) {
  return departure?.when || departure?.plannedWhen || "unknown time"
}

function getRemarks(departure) {
  return Array.isArray(departure?.remarks)
    ? departure.remarks.filter(remark => remark && (remark.summary || remark.text))
    : []
}

function getAlertDefinitions(departures, config) {
  const definitions = []

  for (const departure of departures) {
    if (departure?.reachable === false) {
      continue
    }

    const identity = getDepartureIdentity(departure)
    const lineName = getLineName(departure)
    const departureTimeLabel = getDepartureTimeLabel(departure)
    const direction = departure?.direction || ""
    const scheduledTime = toTimestamp(departure?.rawPlannedWhen)
    const departureTime = toTimestamp(departure?.rawWhen)
    const delaySeconds = Number.isFinite(departure?.delay) ? departure.delay : null
    const common = {
      identity,
      departure,
      lineName,
      direction,
      scheduledTime,
      departureTime,
      delaySeconds,
    }

    if (config.includeCancellations && departure?.canceled) {
      definitions.push({
        ...common,
        kind: "cancellation",
        id: `cancellation:${identity}`,
        title: `${lineName} departure cancelled`,
        body: `The ${departureTimeLabel} departure toward ${direction || "the configured destination"} was cancelled.`,
      })
    }

    if (
      config.includeDelays
      && delaySeconds !== null
      && delaySeconds >= config.delayThresholdMinutes * 60
    ) {
      definitions.push({
        ...common,
        kind: "delay",
        id: `delay:${identity}`,
        title: `${lineName} departure delayed`,
        body: `The ${departureTimeLabel} departure toward ${direction || "the configured destination"} is delayed by ${Math.round(delaySeconds / 60)} minutes.`,
      })
    }

    const remarks = getRemarks(departure)
    if (config.includeRemarks && remarks.length > 0) {
      definitions.push({
        ...common,
        kind: "remark",
        id: `remark:${identity}`,
        remarks,
        title: `${lineName} service information`,
        body: remarks
          .map(remark => remark.summary || remark.text)
          .join(" "),
      })
    }
  }

  if (
    config.includeNoDepartures
    && !departures.some(departure => departure?.reachable !== false)
  ) {
    definitions.push({
      kind: "no_departures",
      id: "no_departures",
      title: "No reachable departures",
      body: "There are currently no reachable departures within the configured window.",
      scheduledTime: null,
      departureTime: null,
      delaySeconds: null,
      remarks: [],
    })
  }

  return definitions
}

function getFingerprint(definition) {
  return JSON.stringify({
    kind: definition.kind,
    scheduledTime: definition.scheduledTime,
    departureTime: definition.departureTime,
    delaySeconds: definition.delaySeconds,
    canceled: Boolean(definition.departure?.canceled),
    remarks: definition.remarks || getRemarks(definition.departure),
  })
}

const SERVICE_ALERT_NOTIFICATION = "PTH_SERVICE_ALERT"

export default class ServiceAlertDetector {
  constructor({ config, identifier, provider, stationId, sendNotification }) {
    this.config = config
    this.identifier = identifier
    this.provider = provider
    this.stationId = stationId
    this.sendNotification = sendNotification
    this.activeAlerts = new Map()
  }

  process(departures) {
    if (!this.config.enabled) {
      return
    }

    const definitions = getAlertDefinitions(
      Array.isArray(departures) ? departures : [],
      this.config,
    )
    const currentAlerts = new Map()

    for (const definition of definitions) {
      const id = `${this.identifier}:${definition.id}`
      const fingerprint = getFingerprint(definition)
      currentAlerts.set(id, { definition, fingerprint })

      if (this.activeAlerts.get(id)?.fingerprint === fingerprint) {
        continue
      }

      this.send(definition, id, true)
    }

    for (const id of this.activeAlerts.keys()) {
      if (currentAlerts.has(id)) {
        continue
      }

      this.send(this.activeAlerts.get(id).definition, id, false)
    }

    this.activeAlerts = currentAlerts
  }

  send(definition, id, active) {
    const departure = definition.departure
    this.sendNotification(SERVICE_ALERT_NOTIFICATION, {
      id,
      active,
      kind: definition.kind,
      provider: this.provider,
      stationId: this.stationId,
      tripId: departure?.tripId || null,
      line: departure?.line || null,
      lineName: definition.lineName,
      direction: departure?.direction || null,
      departureTimeLabel: departure ? getDepartureTimeLabel(departure) : null,
      title: active ? definition.title : undefined,
      body: active ? definition.body : undefined,
      scheduledTime: definition.scheduledTime ?? null,
      departureTime: definition.departureTime ?? null,
      delaySeconds: definition.delaySeconds ?? null,
      canceled: Boolean(departure?.canceled),
      remarks: active ? definition.remarks || getRemarks(departure) : [],
      timestamp: Date.now(),
      expires: definition.departureTime ?? definition.scheduledTime ?? null,
    })
  }
}

export { getAlertDefinitions }
