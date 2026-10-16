![Logo](admin/weishaupt_nwpm_local.png)

# ioBroker.weishaupt_nwpm_local

Local integration of **Weishaupt / Dimplex heat pumps** via the **NWPM gateway** —
no cloud required.

- **Monitoring over Modbus TCP** — temperatures, pressures, run states, demands, faults.
- **Optional control over MQTT** — setpoints and modes that Modbus cannot reach on this
  gateway (hot-water setpoint, heating-curve shift, holiday/party, operating mode).

> Unofficial community adapter. Not affiliated with Weishaupt or Glen Dimplex.
> Use at your own risk — writing values changes real heat-pump behaviour.

## Background

The NWPM gateway exposes the heat-pump manager two ways:


| Interface               | Port  | What it carries                                                |
| ----------------------- | ----- | -------------------------------------------------------------- |
| Modbus TCP              | 502   | **Analog** sensor values + **digital** states only             |
| MQTT (secure WebSocket) | 61898 | **everything**, including **integer** setpoints/modes/counters |

Integer data points (setpoints, modes, energy counters) are **not** available over
Modbus on this gateway — they return 0. That is why control uses the MQTT interface,
which is the same protocol the gateway's own web UI uses.

## Requirements

- ioBroker with `js-controller >= 5` and `admin >= 7`, Node.js `>= 20`.
- A Weishaupt/Dimplex heat pump with an **NWPM** network gateway reachable on your LAN.
- On the gateway web UI → **Settings → Gateway access**, enable **Network services**
  and **Modbus TCP Port 502**, then restart the gateway. (Only needed for monitoring;
  control via MQTT does not require the Modbus toggle.)

## Installation

Until it is in the official ioBroker repository, install from GitHub:

```
Admin → Adapters → "Install from a custom URL" (the GitHub icon):
https://github.com/ChristianSchindler/ioBroker.weishaupt_nwpm_local
```

## Configuration


| Setting                | Meaning                                          |
| ---------------------- | ------------------------------------------------ |
| Gateway IP address     | IP of the NWPM gateway (e.g.`192.168.1.50`)      |
| Modbus TCP port        | usually`502`                                     |
| Modbus device/slave ID | usually`1`                                       |
| Poll interval          | seconds between reads                            |
| Enable control         | turn on to read/write setpoints & modes via MQTT |
| MQTT port / user       | usually`61898` / `mqtt`                          |
| Web UI / MQTT password | **your own** gateway password                    |

The password is stored **encrypted** by ioBroker (it is in `encryptedNative`) and is
**never** part of this repository. Do not commit credentials.

## States

### Monitoring (read-only, Modbus)

`temperatures.*` (outside, flow, return, heat-pump flow, hot water, EVD suction),
`pressure.high` / `pressure.low`, `status.*` (compressor running, fan, pumps, reversing
valve, immersion/flange heater, fault) and `demand.*` (heating, hot water).

The current **operating mode** (Sommer/Winter/Urlaub/Party/…) is the writable enum
`control.operatingMode` below (needs MQTT enabled).

### Extended monitoring (read-only, MQTT — only when "Enable MQTT" is on)

Integer values that Modbus cannot deliver on this gateway:


| State                                                                                                      | Unit | Note                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| `status.operatingState`                                                                                    | enum | current state: Aus/Heizen/Schwimmbad/Warmwasser/Kühlen/Energie-Opt. |
| `hotWater.status`                                                                                          | enum | DHW status: Anforderung/Regenerativ/Spülzeit/Standzeit              |
| `hotWater.setTemperature`                                                                                  | °C  | current DHW set temperature                                          |
| `energy.heating`                                                                                           | kWh  | heat produced for heating                                            |
| `energy.hotWater`                                                                                          | kWh  | heat produced for hot water                                          |
| `energy.generated`                                                                                         | kWh  | total produced heat (= heating + hot water)                          |
| `energy.environmental`                                                                                     | kWh  | environmental energy harvested                                       |
| `runtime.compressor1` / `.fan` / `.heatingPump` / `.hotWaterPump` / `.additionalPump` / `.immersionHeater` | h    | operating hours                                                      |
| `cycles.compressor1Total` / `.compressor1Heating` / `.compressor1HotWater`                                 | —   | compressor cycle counts                                              |
| `history.errors` / `history.locks`                                                                         | JSON | last 10 faults / lockouts (with timestamp + temps)                   |
| `history.lastErrorTime` / `.lastErrorCode` / `.lastLockTime`                                               | —   | most recent fault / lockout                                          |

> Energy counters are 12-digit values split across three 4-digit registers and combined as
> `ST1bis4 + ST5bis8*1e4 + ST9bis12*1e8`. The combined values match the heat-pump
> **controller display** exactly (e.g. Heizen 10512, Warmwasser 12158, Wärmepumpe gesamt
> 22670, Umweltenergie 17998 kWh). Note: the Dimplex **web** UI shows different, incorrect
> numbers for these on mismatched firmware — the controller display (and this combine) is
> authoritative.
>
> DHW state mirrors the web UI's "Domestic hot water" tab
> (Request = `demand.hotWater`, Status = `hotWater.status`, Set temperature =
> `hotWater.setTemperature`, Current temperature = `temperatures.hotWater`).

### Control (read/write, MQTT — only when "Enable MQTT" is on)


| State                      | Range      | Note                                                                                                  |
| -------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `control.hotWaterSetpoint` | 30–85 °C | hot-water target                                                                                      |
| `control.curveShiftHk1`    | 0–38      | heating-curve parallel shift;`value − 19 = K`                                                        |
| `control.curveEndpointHk1` | 20–70 °C | heating-curve steepness                                                                               |
| `control.holidayDays`      | 0–150     | holiday duration                                                                                      |
| `control.partyHours`       | 0–72      | party duration                                                                                        |
| `control.operatingMode`    | enum       | 0 Sommer · 1 Winter · 2 Urlaub · 3 Party · 4 2. Wärmeerzeuger · 5 Kühlung · 6 Auto (dropdown) |

To change the **flow (Vorlauf) temperature** on a weather-compensated circuit, adjust
`control.curveShiftHk1` (each step ≈ 1 K).

## Compatibility

Developed against a gateway running Dimplex "NWPM Touch" firmware (controller
pCO5+). Register availability can differ by firmware/model; see the controller's data
point list. Issues and pull requests welcome.

## Changelog

### 0.1.0

- Initial release: Modbus monitoring + optional MQTT control.

## License

MIT © 2026 Christian Schindler
