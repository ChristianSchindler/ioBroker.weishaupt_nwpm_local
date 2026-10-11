"use strict";

/**
 * Curated register / data-point definitions for the Weishaupt / Dimplex NWPM gateway.
 *
 * Addressing note: `addr` is the raw Modbus PDU address (0-based), which equals the
 * firmware BMSIndex. The gateway's Modbus bridge only exposes Analog values (holding
 * registers) and Digital values (coils); Integer points (setpoints, modes, counters)
 * are NOT available over Modbus and are reached through MQTT instead (see MQTT_POINTS).
 */

// --- Monitoring: Modbus holding registers (Analog, signed, scaled by `factor`) ---
const HOLDING = [
    { id: "temperatures.outside",        addr: 1301, name: "Außentemperatur",            role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "temperatures.flow",           addr: 1300, name: "Vorlauftemperatur",          role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "temperatures.return",         addr: 800,  name: "Rücklauftemperatur",         role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "temperatures.flowHeatPump",   addr: 801,  name: "Vorlauftemperatur Wärmepumpe", role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "temperatures.hotWater",       addr: 1305, name: "Warmwassertemperatur",       role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "temperatures.evdSuctionGas",  addr: 601,  name: "EVD Sauggastemperatur",      role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "pressure.high",               addr: 1280, name: "Hochdruck",                  role: "value.pressure",    unit: "bar", factor: 0.1 },
    { id: "pressure.low",                addr: 4865, name: "Niederdruck",                role: "value.pressure",    unit: "bar", factor: 0.1 },
];

// --- Monitoring: Modbus coils (Digital / boolean) ---
const COILS = [
    { id: "status.compressorRunning",    addr: 1500, name: "Verdichter läuft",          role: "indicator.working" },
    { id: "status.fan",                  addr: 1502, name: "Ventilator",                role: "indicator.working" },
    { id: "status.heatingPump",          addr: 1512, name: "Heizkreispumpe",            role: "indicator.working" },
    { id: "status.dhwCirculationPump",   addr: 1521, name: "Warmwasser-Zirkulationspumpe", role: "indicator.working" },
    { id: "status.reversingValve",       addr: 1504, name: "Internes 4-Wege-Ventil",    role: "indicator" },
    { id: "status.immersionHeater",      addr: 1509, name: "Tauchheizkörper",           role: "indicator.working" },
    { id: "status.dhwFlangeHeater",      addr: 1510, name: "Warmwasser-Flanschheizung", role: "indicator.working" },
    { id: "demand.heating",              addr: 727,  name: "Heizen Anforderung",        role: "indicator" },
    { id: "demand.hotWater",             addr: 726,  name: "Warmwasser Anforderung",    role: "indicator" },
    { id: "status.fault",                addr: 1523, name: "Störung",                   role: "indicator.alarm" },
];

// --- MQTT read-only monitoring: Integer points Modbus cannot deliver ---
// `combine` sums 4-digit groups: value = g1 + g2*1e4 + g3*1e8 (verified: Heizen +
// Warmwasser = total). These are lifetime counters.
const MQTT_MONITOR = [
    { id: "status.operatingState", point: "1586i", name: "Betriebszustand", role: "value",
      states: { "0": "Aus", "1": "Aus", "2": "Heizen", "3": "Schwimmbad", "4": "Warmwasser", "5": "Kühlen", "6": "Energie-Optimierung" } },
    // Domestic hot water status + current set temperature (as shown in the UI's DHW tab)
    { id: "hotWater.status",         point: "1593i", name: "Warmwasser Status", role: "value",
      states: { "0": "Anforderung", "1": "Regenerativ", "2": "Spülzeit", "3": "Standzeit" } },
    { id: "hotWater.setTemperature", point: "1594i", name: "Warmwasser Solltemperatur (aktuell)", role: "value.temperature", unit: "°C", factor: 0.1 },
    // Energy counters — the gateway's display counters (WMZ_Anz_*/Qc_Anz_G). These equal the
    // web UI's main (resettable) energy row. The UI's separate "…Total" row adds an internal
    // archive that is NOT exposed over Modbus/MQTT (verified by a full register scan), so it
    // cannot be read here. Generated = heating + hot water.
    { id: "energy.heating",       point: "1663i", name: "Wärmemenge Heizen",       role: "value.energy", unit: "kWh" },
    { id: "energy.hotWater",      point: "1669i", name: "Wärmemenge Warmwasser",   role: "value.energy", unit: "kWh" },
    { id: "energy.generated",     point: "1660i", name: "Erzeugte Wärmemenge",     role: "value.energy", unit: "kWh" },
    { id: "energy.environmental", point: "1644i", name: "Umweltenergie",           role: "value.energy", unit: "kWh" },
    { id: "runtime.compressor1",   point: "1380i", name: "Betriebsstunden Verdichter 1",   role: "value", unit: "h" },
    { id: "runtime.fan",           point: "1384i", name: "Betriebsstunden Ventilator",     role: "value", unit: "h" },
    { id: "runtime.heatingPump",   point: "1385i", name: "Betriebsstunden Heizungspumpe",  role: "value", unit: "h" },
    { id: "runtime.hotWaterPump",  point: "1386i", name: "Betriebsstunden Warmwasserpumpe", role: "value", unit: "h" },
    { id: "runtime.additionalPump", point: "1390i", name: "Betriebsstunden Zusatzpumpe",   role: "value", unit: "h" },
    { id: "runtime.immersionHeater", point: "1387i", name: "Betriebsstunden Tauchheizkörper", role: "value", unit: "h" },
    { id: "cycles.compressor1Total",    point: "1491i", name: "Schaltvorgänge Verdichter 1 gesamt",     role: "value" },
    { id: "cycles.compressor1Heating",  point: "1492i", name: "Schaltvorgänge Verdichter 1 Heizung",    role: "value" },
    { id: "cycles.compressor1HotWater", point: "1493i", name: "Schaltvorgänge Verdichter 1 Warmwasser", role: "value" },
];

// --- Control / full values: MQTT points (by name "<BMSIndex><type>") ---
// type: a = Analog, i = Integer, d = Digital. Integer points are MQTT-only.
const MQTT_POINTS = [
    { id: "control.hotWaterSetpoint",      point: "1042i", name: "Warmwasser-Solltemperatur",      role: "level.temperature", unit: "°C", type: "number", min: 30,  max: 85,  factor: 1, writable: true },
    { id: "control.curveShiftHk1",         point: "767i",  name: "Heizkennlinie Parallelverschiebung HK1 (Wert-19 = K)", role: "level", type: "number", min: 0, max: 38, factor: 1, writable: true },
    { id: "control.curveEndpointHk1",      point: "766i",  name: "Heizkurvenendpunkt HK1",          role: "level.temperature", unit: "°C", type: "number", min: 20,  max: 70,  factor: 1, writable: true },
    { id: "control.holidayDays",           point: "1108i", name: "Urlaubstage",                     role: "level", unit: "d", type: "number", min: 0, max: 150, factor: 1, writable: true },
    { id: "control.partyHours",            point: "715i",  name: "Partystunden",                    role: "level", unit: "h", type: "number", min: 0, max: 72, factor: 1, writable: true },
    { id: "control.operatingMode",         point: "714i",  name: "Betriebsart", role: "level.mode", type: "number", min: 0, max: 6, factor: 1, writable: true,
      states: { "0": "Sommer", "1": "Winter", "2": "Urlaub", "3": "Party", "4": "2. Wärmeerzeuger", "5": "Kühlung", "6": "Auto" } },
];

module.exports = { HOLDING, COILS, MQTT_MONITOR, MQTT_POINTS };
