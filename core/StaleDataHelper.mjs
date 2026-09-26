/**
 * Removes departures that have already passed.
 * @param {Array<object>} departures - Departure data to filter.
 * @param {number} [now=Date.now()] - Current time as a Unix timestamp.
 * @returns {Array<object>} Departures that are still upcoming or have no valid timestamp.
 */
export function getVisibleDepartures(departures, now = Date.now()) {
  return departures.filter((departure) => {
    const departureTime = Date.parse(
      departure.rawWhen || departure.when || departure.rawPlannedWhen,
    )
    return !Number.isFinite(departureTime) || departureTime > now
  })
}

/**
 * Checks whether the last successful result is still within the stale-data window.
 * @param {Date|number} lastUpdate - Last successful update time.
 * @param {number} maxStaleMinutes - Maximum age of stale data in minutes.
 * @param {number} [now=Date.now()] - Current time as a Unix timestamp.
 * @returns {boolean} Whether stale data may still be displayed.
 */
export function canUseStaleData(lastUpdate, maxStaleMinutes, now = Date.now()) {
  const timestamp = lastUpdate instanceof Date
    ? lastUpdate.getTime()
    : lastUpdate

  if (!Number.isFinite(timestamp) || !Number.isFinite(maxStaleMinutes)) {
    return false
  }

  return now - timestamp <= maxStaleMinutes * 60 * 1000
}
