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

States are grouped by which water they are about:

- **`drinkingWater.*`** (Trinkwasser): the hot tap-water tank for showers and taps.
- **`heatingWater.*`** (Heizwasser): the closed loop that runs through the radiators.

Everything else (outside temperature, compressor, counters, modes) is general.
States marked **MQTT** need "Enable MQTT" on; the rest come from Modbus.

### Drinking water (`drinkingWater.*`)

| State                                                        | Unit  | Source | Note                                                                     |
| ------------------------------------------------------------ | ----- | ------ | ------------------------------------------------------------------------ |
| `drinkingWater.temperature`                                  | °C    | Modbus | tank temperature                                                         |
| `drinkingWater.demand`                                       | bool  | Modbus | controller wants to heat the tank                                        |
| `drinkingWater.circulationPump`                              | bool  | Modbus | circulation pump running                                                 |
| `drinkingWater.flangeHeater`                                 | bool  | Modbus | electric flange heater on                                                |
| `drinkingWater.status`                                       | enum  | MQTT   | Anforderung/Regenerativ/Spülzeit/Standzeit                               |
| `drinkingWater.setpoint`                                     | °C    | MQTT   | comfort target — **writable** (30–85)                                    |
| `drinkingWater.currentSetpoint`                              | °C    | MQTT   | target active right now (lower during a setback window)                  |
| `drinkingWater.setback.time1Start` / `.time1End` / `.time2Start` / `.time2End` | HH:MM | MQTT | setback windows — **writable** (Zeit 2 unused but configurable) |
| `drinkingWater.setback.temperature`                          | °C    | MQTT   | reduced target during the setback windows — **writable** (10–99)         |

### Heating water (`heatingWater.*`)

| State                                                        | Unit  | Source | Note                                                                     |
| ------------------------------------------------------------ | ----- | ------ | ------------------------------------------------------------------------ |
| `heatingWater.flow`                                          | °C    | Modbus | water going out to the radiators (Vorlauf)                               |
| `heatingWater.return`                                        | °C    | Modbus | water coming back from the radiators (Rücklauf)                          |
| `heatingWater.flowHeatPump`                                  | °C    | Modbus | flow measured directly at the heat pump outlet                           |
| `heatingWater.pump`                                          | bool  | Modbus | heating circulation pump running                                         |
| `heatingWater.demand`                                        | bool  | Modbus | controller wants heat for the radiators                                  |
| `heatingWater.setback.active1` / `.active2`                  | bool  | Modbus | a heating setback window is active now                                   |
| `heatingWater.status`                                        | —     | MQTT   | heating status (raw value, meaning not yet mapped)                       |
| `heatingWater.currentSetpoint`                               | °C    | MQTT   | target active right now (curve incl. setback/raise) — compare with `heatingWater.return` |
| `heatingWater.curveShift`                                    | 0–38  | MQTT   | heating-curve parallel shift, `value − 19 = K` — **writable**            |
| `heatingWater.curveEndpoint`                                 | °C    | MQTT   | heating-curve steepness (20–70) — **writable**                           |
| `heatingWater.setback.time1Start` / `.time1End` / `.time2Start` / `.time2End` | HH:MM | MQTT | setback windows — **writable**                                  |
| `heatingWater.setback.value`                                 | K     | MQTT   | how much the curve is lowered in the setback windows — **writable** (0–19) |
| `heatingWater.raise.time1Start` / `.time1End` / `.time2Start` / `.time2End` / `.value` | HH:MM / K | MQTT | raise windows + raise amount — **writable**          |

To make the radiators warmer or cooler, adjust `heatingWater.curveShift` (each step ≈ 1 K).

### General

| State                                                        | Unit  | Source | Note                                                                     |
| ------------------------------------------------------------ | ----- | ------ | ------------------------------------------------------------------------ |
| `temperatures.outside` / `.evdSuctionGas`                    | °C    | Modbus | outside temperature, refrigerant suction gas                             |
| `pressure.high` / `pressure.low`                             | bar   | Modbus | refrigerant pressures                                                    |
| `status.compressorRunning` / `.fan` / `.reversingValve` / `.immersionHeater` / `.fault` | bool | Modbus | components / fault                                |
| `smartGrid.input1` / `.input2`                               | bool  | Modbus | SG-Ready contacts (e.g. PV-surplus relay from the inverter)              |
| `smartGrid.state`                                            | enum  | Modbus | resulting Smart Grid state: 0 Normal · 1 Niedrig · 2 Hoch · 3 Problem    |
| `status.operatingState`                                      | enum  | MQTT   | what it is doing now: Aus/Heizen/Schwimmbad/Trinkwasser/Kühlen/Energie-Opt. |
| `status.powerStage`                                          | —     | MQTT   | compressor heating power stage                                           |
| `energy.heatingWater` / `energy.drinkingWater`               | kWh   | MQTT   | heat produced for the radiators / for the tank                           |
| `energy.generated`                                           | kWh   | MQTT   | total produced heat (= heating water + drinking water)                   |
| `energy.environmental`                                       | kWh   | MQTT   | environmental energy harvested                                           |
| `energy.electrical`                                          | kWh   | MQTT   | **electrical energy consumed** (derived: `generated − environmental`)    |
| `energy.cop`                                                 | —     | MQTT   | seasonal performance factor (derived: `generated / electrical`)          |
| `runtime.compressor1` / `.fan` / `.heatingWaterPump` / `.drinkingWaterPump` / `.additionalPump` / `.immersionHeater` | h | MQTT | operating hours |
| `cycles.compressor1Total` / `.compressor1HeatingWater` / `.compressor1DrinkingWater` | — | MQTT | compressor cycle counts                                 |
| `history.errors` / `history.locks`                           | JSON  | MQTT   | last 10 faults / lockouts (with timestamp + temps)                       |
| `history.lastErrorTime` / `.lastErrorCode` / `.lastLockTime` | —     | MQTT   | most recent fault / lockout                                              |
| `control.operatingMode`                                      | enum  | MQTT   | 0 Sommer · 1 Winter · 2 Urlaub · 3 Party · 4 2. Wärmeerzeuger · 5 Kühlung · 6 Auto — **writable** |
| `control.holidayDays` / `control.partyHours`                 | d / h | MQTT   | holiday (0–150) / party (0–72) duration — **writable**                   |

> Energy counters are 12-digit values split across three 4-digit registers and combined as
> `ST1bis4 + ST5bis8*1e4 + ST9bis12*1e8`. The combined values match the heat-pump
> **controller display** exactly (e.g. Heizen 10512, Warmwasser 12158, Wärmepumpe gesamt
> 22670, Umweltenergie 17998 kWh). Note: the Dimplex **web** UI shows different, incorrect
> numbers for these on mismatched firmware — the controller display (and this combine) is
> authoritative.
>
> This gateway exposes **no electrical power/energy** register (the live-power registers
> read 0 even while the compressor runs). `energy.electrical` is therefore derived from the
> energy balance *produced heat = environmental heat + electrical energy*, i.e.
> `energy.generated − energy.environmental`. It is as accurate as the device's own thermal
> counters and matches the consumption figure shown on the controller display. For a true
> metered value, add an external power meter (e.g. Shelly 3EM) on the heat-pump supply.

## Compatibility

Developed against a gateway running Dimplex "NWPM Touch" firmware (controller
pCO5+). Register availability can differ by firmware/model; see the controller's data
point list. Issues and pull requests welcome.

## Changelog

### 0.2.0

- `energy.electrical` no longer flaps by ±1 kWh (it is `generated − environmental`, two
  independently ticking whole-kWh counters). Drops of <= 1 kWh are ignored so the counter
  stays monotonic. Tip: aggregate counters with `fn: last` (not `mean`) in InfluxDB/Grafana.
- **Breaking: states renamed and regrouped** under `drinkingWater.*` (Trinkwasser) and
  `heatingWater.*` (Heizwasser) so every name says which water it is about, e.g.
  `temperatures.hotWater` → `drinkingWater.temperature`, `temperatures.flow` →
  `heatingWater.flow`, `control.hotWaterSetpoint` → `drinkingWater.setpoint`,
  `control.curveShiftHk1` → `heatingWater.curveShift`, `energy.hotWater` →
  `energy.drinkingWater` (full list: `RENAMED` in `lib/registers.js`). On startup the adapter
  copies each old state's custom settings (e.g. InfluxDB logging) to the new state and
  deletes the old one. History is stored under the new name from then on, so update Grafana
  queries and scripts.
- New read-only SG-Ready states: `smartGrid.input1` / `.input2` (contacts) and `smartGrid.state`
  (Normal/Niedrig/Hoch/Problem).
- New writable state `drinkingWater.setback.temperature` (setback target, register 1045i).
- New heating-water states: `heatingWater.status`, `heatingWater.currentSetpoint`, setback
  and raise windows + amounts (`heatingWater.setback.*`, `heatingWater.raise.*`).

### 0.1.0

- Initial release: Modbus monitoring + optional MQTT control.

## License

MIT © 2026 Christian Schindler
