# MMM-PublicTransportHub

A [MagicMirror²](https://magicmirror.builders/) module to show public transport departures on your mirror, with broad international coverage and per-instance provider switching.

This module supports multiple providers in one place (`transitous`, `hafas`, `vendo`), so you can choose the backend that works best for each station.

Compared with earlier public transport modules that were tied to one backend, [Transitous](https://transitous.org/sources/) gives this module much broader regional coverage out of the box.

Transitous is also a community-driven open-source project, which fits well with the MagicMirror ecosystem.

## Screenshot

![Screenshot](screenshot.png)

## Provider Comparison

|                      | Transitous                                                | HAFAS                                                                               | Vendo                                               |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Geographic scope** | 🌍 Global                                                 | 🌍 mostly Europe (per profile)                                                      | 🇩🇪 Germany                                          |
| **Coverage model**   | Community-aggregated open data (GTFS/GTFS-RT)             | Single-operator API per profile                                                     | Deutsche Bahn official API                          |
| **Profiles**         | — (one global instance)                                   | ~20 operator-specific profiles                                                      | `db`, `dbnav`, `dbbahnhof`, `dbregioguide`, `dbris` |
| **Real-time data**   | Where upstream feeds provide it                           | Yes, per operator                                                                   | Yes                                                 |
| **Best for**         | International or mixed regions                            | Local operators (e.g. BVG, ÖBB, SNCB)                                               | Deutsche Bahn trains/Germany                        |
| **Coverage details** | [transitous.org/sources](https://transitous.org/sources/) | [profile list](https://github.com/public-transport/hafas-client/tree/main/p#readme) | primarily DE, some AT/CH                            |

## Choosing a Provider

Providers differ in coverage and data quality per region — no single provider is best everywhere.

- **Transitous** is a good first choice: it covers most of Europe and many regions worldwide via aggregated open GTFS feeds.
- **HAFAS** (with the right profile) often provides richer real-time data and better stop matching for specific operators.
- **Vendo** (`db`/`dbnav`) is the strongest choice for Deutsche Bahn long-distance and regional trains within Germany.

Recommendation: test all three providers for your specific station and pick the one that gives the best results locally.

Limitations/trade-offs to keep in mind:

- Providers still differ in line naming, products, and platform semantics.
- Timeout/retry is intentionally simple (fixed backoff, no circuit breaker).
- Reachability currently uses only configured `timeToStation` and departure timestamps.

## Installation

Clone this module into your MagicMirror modules directory and install dependencies:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/KristjanESPERANTO/MMM-PublicTransportHub
cd MMM-PublicTransportHub
npm ci --omit=dev
```

## Update

To update, pull the latest changes in the module directory:

```bash
cd ~/MagicMirror/modules/MMM-PublicTransportHub
git pull
npm ci --omit=dev
```

## Configuration

### Minimal Example

```js
    {
      module: "MMM-PublicTransportHub",
      position: "top_left",
      config: {
        provider: "transitous",
        stationId: "de-DELFI_de:11000:900100003",
        contact: "you@example.com",
      },
    },
```

### Full Example

```js
    {
      module: "MMM-PublicTransportHub",
      position: "top_left",
      header: "S+U Alexanderplatz Bhf",
      config: {
        provider: "transitous",
        stationId: "de-DELFI_de:11000:900100003",
        updatesEvery: 60,
        maxDepartures: 7,
        timeToStation: 4,
        maxUnreachableDepartures: 2,
        excludeCanceled: false,
        lineFilter: ["S", "U2"],
        directionFilter: ["Potsdam", "Alexanderplatz"],
        productFilter: ["subway", "suburban"],
        showDelay: false,
        showRealtimeIndicator: true,
        showRemarks: true,
        columnOrder: ["time", "line", "direction", "platform"], // reorder/hide columns; valid: time, line, direction, platform
        lineStylePreset: "none", // plain | none | berlin | duesseldorf | ...
        replaceInLineNames: { "Bus ": "" },
        requestTimeoutMs: 12000,
        fetchRetries: 1,
        // For Transitous, set this to a reachable email address or your MagicMirror forum alias.
        contact: "you@example.com",
      }
    },
```

### Configuration Options

| Option                     | Default                                     | Notes                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                 | `"transitous"`                              | Provider to use: `transitous`, `hafas`, `vendo`.                                                                                                                                                        |
| `stationId`                | `""`                                        | Required for all providers.                                                                                                                                                                             |
| `updatesEvery`             | `60`                                        | Seconds between updates. Clamped to minimum `30`.                                                                                                                                                       |
| `maxDepartures`            | `7`                                         | Maximum departures to render. Minimum `1`.                                                                                                                                                              |
| `animationSpeed`           | `1000`                                      | DOM update animation speed in ms.                                                                                                                                                                       |
| `showLastUpdate`           | `true`                                      | Show the last update timestamp in the module footer.                                                                                                                                                    |
| `showDelay`                | `false`                                     | Show +/- delay minutes.                                                                                                                                                                                 |
| `showRealtimeIndicator`    | `true`                                      | Realtime departures are subtly underlined.                                                                                                                                                              |
| `showRemarks`              | `true`                                      | Show warning/remark lines below departures.                                                                                                                                                             |
| `columnOrder`              | `["time", "line", "direction", "platform"]` | Order and visibility of table columns. Allowed values: `time`, `line`, `direction`, `platform`. Remove a value to hide that column (for example omit `platform`). Invalid/duplicate values are ignored. |
| `timeToStation`            | `0`                                         | Walking time in minutes. Minimum `0`.                                                                                                                                                                   |
| `maxUnreachableDepartures` | `2`                                         | Maximum number of unreachable departures to keep (based on `timeToStation`). Set `0` to hide all unreachable departures. `null` means no extra limit.                                                   |
| `excludeCanceled`          | `false`                                     | Exclude canceled departures.                                                                                                                                                                            |
| `requestTimeoutMs`         | `12000`                                     | Per-fetch timeout in ms. Clamped to `1000-60000`.                                                                                                                                                       |
| `fetchRetries`             | `1`                                         | Retry attempts after first try. Clamped to `0-5`.                                                                                                                                                       |
| `lineFilter`               | `[]`                                        | Only include matching lines. Accepts array or comma-separated string.                                                                                                                                   |
| `directionFilter`          | `[]`                                        | Only include matching directions. Accepts array or comma-separated string.                                                                                                                              |
| `productFilter`            | `[]`                                        | Only include matching products. Accepts array or comma-separated string.                                                                                                                                |
| `replaceInDirections`      | `{}`                                        | String replacements before filtering/rendering directions.                                                                                                                                              |
| `replaceInLineNames`       | `{}`                                        | String replacements before rendering line labels.                                                                                                                                                       |
| `lineStylePreset`          | `"none"`                                    | `none`, `plain`, or city preset: `berlin`, `duesseldorf`, `graz`, `halle`, `hamburg`, `hannover`, `leipzig`, `magdeburg`, `munich`, `nuernberg`, `stuttgart`. Invalid values fall back to `none`.       |
| `contact`                  | `""`                                        | Required for `provider: "transitous"`. Use a reachable email address or MagicMirror forum alias.                                                                                                        |
| `userAgent`                | `""`                                        | Optional custom User-Agent suffix for provider requests.                                                                                                                                                |
| `clientVersion`            | `""`                                        | Optional client version string sent to provider clients.                                                                                                                                                |
| `hafasProfile`             | `"db"`                                      | HAFAS profile when `provider: "hafas"` (for example `insa`, `vbb`).                                                                                                                                     |
| `vendoProfile`             | `"db"`                                      | Vendo profile when `provider: "vendo"` (`db`, `dbnav`, `dbbahnhof`, `dbregioguide`, `dbris`).                                                                                                           |
| `timeInFutureMinutes`      | `90`                                        | Look-ahead window in minutes for provider queries. Minimum `1`.                                                                                                                                         |
| `includeRelatedStations`   | `false`                                     | Include nearby/related stops if supported by the provider.                                                                                                                                              |

Note: legacy option `showColoredLineBadges` has been replaced by `lineStylePreset`.

## Station Query Helper

Use the interactive helper to find station IDs and ready-to-copy config snippets:

```bash
node --run query
```

The script asks for a station/location name, then queries Transitous by default. HAFAS and Vendo queries are optional: enter the desired profiles when prompted, or leave them empty to skip them. This avoids relying on DB profiles that may currently be blocked by the Deutsche Bahn API.

Example flow:

```sh
Station or address to search (e.g. 'Gotha Hbf'): Leipzig Hbf
Transitous is always queried. HAFAS and Vendo are optional; press Enter to skip either one.
Optional HAFAS profile(s), comma-separated (e.g. 'vmt,insa,vbb'; Enter to skip): insa
Optional Vendo profile(s), comma-separated (e.g. 'db'; Enter to skip):

Select the station result to use in your configuration:
 1. transitous - Leipzig Hbf | de-...
 2. hafas (insa) - Leipzig, Hauptbahnhof | 801...
Enter a result number to generate its config, or press Enter to quit.
2
```

The script then queries Transitous and any selected profiles. Select the result you want to use, and the script prints a matching config block ready to copy. The selected profile is included automatically for HAFAS or Vendo results. For Transitous results, replace the generated `YOUR_EMAIL_OR_FORUM_ALIAS` placeholder with a reachable email address or MagicMirror forum alias before using the config. Leave the selection empty to exit without generating a config.

## Credits

Some parts of this module are inspired by [MMM-PublicTransportHafas](https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.

## Changelog

All notable changes to this project will be documented in the [CHANGELOG.md](CHANGELOG.md) file.
