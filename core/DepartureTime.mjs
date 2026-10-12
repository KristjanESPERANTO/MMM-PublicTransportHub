function parseTimestamp(raw) {
  if (!raw) {
    return null
  }
  const timestamp = new Date(raw).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function getEffectiveDepartureTimestamp(departure) {
  const plannedTimestamp = parseTimestamp(departure?.rawPlannedWhen)
  const liveTimestamp = parseTimestamp(departure?.rawWhen)

  if (liveTimestamp !== null && liveTimestamp !== plannedTimestamp) {
    return liveTimestamp
  }

  if (plannedTimestamp !== null && Number.isFinite(departure?.delay)) {
    return plannedTimestamp + departure.delay * 1000
  }

  return plannedTimestamp ?? liveTimestamp
}
