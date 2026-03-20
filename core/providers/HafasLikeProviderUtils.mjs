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

function getRawWhen(departure) {
  return departure.when || departure.plannedWhen || null
}

function getRawPlannedWhen(departure) {
  return departure.plannedWhen || departure.when || null
}

function toDelaySeconds(departure, rawWhen, rawPlannedWhen) {
  if (Number.isFinite(departure.delay)) {
    return departure.delay * 60
  }

  if (!rawWhen || !rawPlannedWhen) {
    return null
  }

  return Math.round(
    (new Date(rawWhen).getTime() - new Date(rawPlannedWhen).getTime()) / 1000,
  )
}

export function normalizeHafasLikeDeparture(departure) {
  const rawWhen = getRawWhen(departure)
  const rawPlannedWhen = getRawPlannedWhen(departure)
  const hasRealtime
    = departure.realtimeDataUpdatedAt != null
      || Number.isFinite(departure.delay)
      || (departure.when
        && departure.plannedWhen
        && departure.when !== departure.plannedWhen)

  return {
    tripId: departure.tripId || departure.trip?.id || null,
    when: formatClockTime(rawWhen),
    plannedWhen: formatClockTime(rawPlannedWhen),
    rawWhen,
    rawPlannedWhen,
    realTime: hasRealtime,
    hasRealtime: hasRealtime,
    delay: toDelaySeconds(departure, rawWhen, rawPlannedWhen),
    direction: departure.direction || departure.provenance || "",
    line: {
      id: departure.line?.id || "",
      name: departure.line?.name || departure.line?.fahrtNr || "?",
      product: departure.line?.product || null,
    },
    platform: departure.platform || departure.plannedPlatform || null,
    remarks: (departure.remarks || []).map(remark => ({
      summary: remark.summary || remark.text || "",
      text: remark.text || remark.summary || "",
      type: remark.type || "hint",
    })),
    canceled: departure.cancelled || false,
  }
}
