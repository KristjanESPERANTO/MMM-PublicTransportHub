import { getLineStyleTokens } from "./LineStyleTokens.mjs"

const HEADER_SYMBOLS = {
  direction: "fa fa-exchange",
  line: "fa fa-bus",
  platform: "fa fa-map-marker",
  time: "fa fa-clock-o",
}

export default class PtDomBuilder {
  constructor(config, translate) {
    this.config = config
    this.translate = typeof translate === "function" ? translate : key => key
  }

  getEffectiveTimeFormat() {
    if (Number.isFinite(this.config.timeFormat)) {
      return this.config.timeFormat === 12 ? 12 : 24
    }

    if (
      typeof globalThis.config !== "undefined"
      && Number.isFinite(globalThis.config.timeFormat)
    ) {
      return globalThis.config.timeFormat === 12 ? 12 : 24
    }

    return 24
  }

  formatDisplayTime(rawWhen) {
    if (!rawWhen) {
      return "--:--"
    }

    const date = new Date(rawWhen)
    if (Number.isNaN(date.getTime())) {
      return "--:--"
    }

    const use12h = this.getEffectiveTimeFormat() === 12
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: use12h,
    })
  }

  getDisplayedTime(departure) {
    const rawWhen = departure.rawWhen || departure.rawPlannedWhen || null
    const formatted = this.formatDisplayTime(rawWhen)
    if (formatted !== "--:--") {
      return formatted
    }

    return departure.when || departure.plannedWhen || "--:--"
  }

  getDelayLabel(delaySeconds) {
    if (!Number.isFinite(delaySeconds) || delaySeconds === 0) {
      return null
    }

    const delayMinutes = Math.round(delaySeconds / 60)
    if (delayMinutes === 0) {
      return null
    }

    if (delayMinutes > 0) {
      return `+${delayMinutes}`
    }

    return `${delayMinutes}`
  }

  getRemarksText(departure) {
    const remarks = Array.isArray(departure.remarks) ? departure.remarks : []
    return remarks
      .map(remark => this.stripMarkup(remark.summary || remark.text || ""))
      .filter(Boolean)
      .slice(0, 2)
      .join(" | ")
  }

  stripMarkup(value) {
    const markup = String(value)
    if (typeof document !== "undefined") {
      const container = document.createElement("div")
      container.innerHTML = markup
      return container.textContent.trim()
    }

    return markup
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  getProcessedLineName(line) {
    const originalName = String(line?.name || "")
    const replacements = this.config.replaceInLineNames

    let processed = originalName
    if (
      replacements
      && typeof replacements === "object"
      && !Array.isArray(replacements)
    ) {
      for (const [search, replacement] of Object.entries(replacements)) {
        if (!search) {
          continue
        }

        processed = processed.split(search).join(String(replacement ?? ""))
      }
    }

    if (String(line?.product || "").toLowerCase() === "bus") {
      processed = processed.replace(/^bus\s+/iu, "")
    }

    const trimmed = processed.trim()
    if (trimmed) {
      return trimmed
    }

    return String(line?.id || "?")
  }

  getMessageDom(message) {
    const wrapper = document.createElement("div")
    wrapper.className = "small bright"
    wrapper.textContent = message
    return wrapper
  }

  getTimeCell(dep) {
    const timeCell = document.createElement("td")
    timeCell.className = "bright mmm-pthub-time"
    timeCell.textContent = this.getDisplayedTime(dep)

    if (this.config.showDelay !== false) {
      const delayLabel = this.getDelayLabel(dep.delay)
      if (delayLabel) {
        const delaySpan = document.createElement("span")
        delaySpan.className
          = Number(dep.delay) > 0
            ? "mmm-pthub-delay mmm-pthub-delay-late"
            : "mmm-pthub-delay mmm-pthub-delay-early"
        delaySpan.textContent = delayLabel
        timeCell.appendChild(delaySpan)
      }
    }

    if (this.config.showRealtimeIndicator !== false && dep.realTime) {
      timeCell.classList.add("mmm-pthub-time-realtime")
    }

    if (dep.canceled) {
      const canceledSpan = document.createElement("span")
      canceledSpan.className = "mmm-pthub-badge mmm-pthub-badge-canceled"
      canceledSpan.textContent = "X"
      timeCell.appendChild(canceledSpan)
    }

    return timeCell
  }

  getLineCell(dep) {
    const lineCell = document.createElement("td")
    lineCell.className = "bright mmm-pthub-line"

    const lineBadge = document.createElement("div")
    lineBadge.className = "mmm-pthub-line-sign"
    lineBadge.textContent = this.getProcessedLineName(dep.line)

    const lineTokens = getLineStyleTokens(dep.line)
    lineBadge.dataset.product = lineTokens.product
    lineBadge.dataset.lineId = lineTokens.lineId

    if (this.config.lineStylePreset !== "plain") {
      lineBadge.dataset.productToken = lineTokens.productToken
      lineBadge.dataset.lineToken = lineTokens.lineToken

      if (lineTokens.productToken) {
        lineBadge.classList.add(`mmm-pthub-product-${lineTokens.productToken}`)
      }

      if (lineTokens.lineToken) {
        lineBadge.classList.add(`mmm-pthub-line-${lineTokens.lineToken}`)
      }
    }

    lineCell.appendChild(lineBadge)
    return lineCell
  }

  getDirectionCell(dep) {
    const dirCell = document.createElement("td")
    dirCell.className = "bright mmm-pthub-direction"
    dirCell.textContent = dep.direction || "?"

    if (this.config.showRemarks !== false) {
      const remarksText = this.getRemarksText(dep)
      if (remarksText) {
        const remarksEl = document.createElement("div")
        const hasWarning = (dep.remarks || []).some(
          remark =>
            String(remark?.type || "").toLowerCase() === "warning",
        )
        remarksEl.className = hasWarning
          ? "xsmall mmm-pthub-remarks mmm-pthub-remarks-warning"
          : "xsmall mmm-pthub-remarks"
        remarksEl.textContent = remarksText
        dirCell.appendChild(remarksEl)
      }
    }

    return dirCell
  }

  getPlatformCell(dep) {
    const platformCell = document.createElement("td")
    platformCell.className = "bright mmm-pthub-platform"
    platformCell.textContent = this.getPlatformLabel(dep.platform)
    return platformCell
  }

  getPlatformLabel(platform) {
    if (!platform) {
      return "-"
    }

    return String(platform).replace(/^Pos\. /, "") || "-"
  }

  getHeaderCell(column) {
    const symbolClass = HEADER_SYMBOLS[column]
    if (!symbolClass) {
      return null
    }

    const cell = document.createElement("th")
    cell.className = `mmm-pthub-header-cell mmm-pthub-header-${column}`
    cell.scope = "col"
    const symbol = document.createElement("i")
    symbol.className = symbolClass
    cell.appendChild(symbol)

    return cell
  }

  getHeaderRow(columns) {
    const row = document.createElement("tr")
    row.className = "mmm-pthub-header-row"

    for (const column of columns) {
      const cell = this.getHeaderCell(column)
      if (cell) {
        row.appendChild(cell)
      }
    }

    return row
  }

  getColumnCell(column, dep) {
    switch (column) {
      case "time":
        return this.getTimeCell(dep)
      case "line":
        return this.getLineCell(dep)
      case "direction":
        return this.getDirectionCell(dep)
      case "platform":
        return this.getPlatformCell(dep)
      default:
        return null
    }
  }

  getDeparturesDom(departures, lastUpdate) {
    const wrapper = document.createElement("div")
    wrapper.className = "mmm-pthub-wrapper"
    if (this.config.lineStylePreset && this.config.lineStylePreset !== "none") {
      wrapper.dataset.linePreset = this.config.lineStylePreset
    }

    if (departures.length === 0) {
      const empty = document.createElement("div")
      empty.className = "small dimmed"
      empty.textContent = this.translate("PTH_NO_DEPARTURES")
      wrapper.appendChild(empty)
    }
    else {
      const table = document.createElement("table")
      table.className = "small"

      const columns = Array.isArray(this.config.columnOrder)
        ? this.config.columnOrder
        : ["time", "line", "direction", "platform"]

      if (this.config.showTableHeaders !== false) {
        const tableHead = document.createElement("thead")
        tableHead.appendChild(this.getHeaderRow(columns))
        table.appendChild(tableHead)
      }

      for (const dep of departures) {
        const row = document.createElement("tr")
        row.className = "mmm-pthub-row"

        if (dep.canceled) {
          row.classList.add("mmm-pthub-canceled")
        }

        if (dep.reachable === false) {
          row.classList.add("mmm-pthub-unreachable")
        }

        for (const column of columns) {
          const cell = this.getColumnCell(column, dep)
          if (cell) {
            row.appendChild(cell)
          }
        }

        table.appendChild(row)
      }

      wrapper.appendChild(table)
    }

    if (this.config.showLastUpdate && lastUpdate) {
      const footer = document.createElement("div")
      footer.className = "xsmall dimmed"
      footer.textContent = `${this.translate("PTH_LAST_UPDATE")}: ${lastUpdate.toLocaleTimeString()}`
      wrapper.appendChild(footer)
    }

    return wrapper
  }
}
