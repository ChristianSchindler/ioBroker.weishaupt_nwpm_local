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
    { id: "heatingWater.flow",           addr: 1300, name: "Heizwasser Vorlauf (zu den Heizkörpern)",          role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "heatingWater.return",         addr: 800,  name: "Heizwasser Rücklauf (von den Heizkörpern)",         role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "heatingWater.flowHeatPump",   addr: 801,  name: "Heizwasser Vorlauf direkt an der Wärmepumpe", role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "drinkingWater.temperature",   addr: 1305, name: "Trinkwasser Speichertemperatur",       role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "temperatures.evdSuctionGas",  addr: 601,  name: "EVD Sauggastemperatur",      role: "value.temperature", unit: "°C", factor: 0.1 },
    { id: "pressure.high",               addr: 1280, name: "Hochdruck",                  role: "value.pressure",    unit: "bar", factor: 0.1 },
    { id: "pressure.low",                addr: 4865, name: "Niederdruck",                role: "value.pressure",    unit: "bar", factor: 0.1 },
];

// --- Monitoring: Modbus coils (Digital / boolean) ---
const COILS = [
    { id: "status.compressorRunning",    addr: 1500, name: "Verdichter läuft",          role: "indicator.working" },
    { id: "status.fan",                  addr: 1502, name: "Ventilator",                role: "indicator.working" },
    { id: "heatingWater.pump",           addr: 1512, name: "Heizwasser Umwälzpumpe",            role: "indicator.working" },
    { id: "drinkingWater.circulationPump", addr: 1521, name: "Trinkwasser Zirkulationspumpe", role: "indicator.working" },
    { id: "status.reversingValve",       addr: 1504, name: "Internes 4-Wege-Ventil",    role: "indicator" },
    { id: "status.immersionHeater",      addr: 1509, name: "Tauchheizkörper",           role: "indicator.working" },
    { id: "drinkingWater.flangeHeater",  addr: 1510, name: "Trinkwasser Flanschheizung (elektrisch)", role: "indicator.working" },
    { id: "heatingWater.demand",         addr: 727,  name: "Heizwasser Anforderung",        role: "indicator" },
    { id: "drinkingWater.demand",        addr: 726,  name: "Trinkwasser Anforderung",    role: "indicator" },
    { id: "heatingWater.setback.active1", addr: 734,  name: "Heizwasser Absenkung Zeit 1 aktiv", role: "indicator" },
    { id: "heatingWater.setback.active2", addr: 735,  name: "Heizwasser Absenkung Zeit 2 aktiv", role: "indicator" },
    { id: "status.fault",                addr: 1523, name: "Störung",                   role: "indicator.alarm" },
    // SG-Ready: two contacts driven by e.g. a PV inverter relay (see SMART_GRID for the resulting state).
    { id: "smartGrid.input1",            addr: 1246, name: "Smart Grid Eingang 1 (SG-Ready)", role: "indicator" },
    { id: "smartGrid.input2",            addr: 1247, name: "Smart Grid Eingang 2 (SG-Ready)", role: "indicator" },
];

// --- Smart Grid state: the controller sets exactly one of four consecutive coils
// (692 Normal, 693 Niedrig, 694 Hoch, 695 Problem); combined into one enum state.
// Read 2026-10-27 at night: inputs off, Normal on. Meaning of Niedrig/Hoch not yet verified.
const SMART_GRID = {
    id: "smartGrid.state", addr: 692, name: "Smart Grid Zustand", role: "value",
    states: { "0": "Normal", "1": "Niedrig", "2": "Hoch", "3": "Problem" },
};

// --- MQTT read-only monitoring: Integer points Modbus cannot deliver ---
// `combine` sums 4-digit groups: value = g1 + g2*1e4 + g3*1e8 (verified: Heizen +
// Warmwasser = total). These are lifetime counters.
const MQTT_MONITOR = [
    { id: "status.operatingState", point: "1586i", name: "Betriebszustand", role: "value",
      states: { "0": "Aus", "1": "Aus", "2": "Heizen", "3": "Schwimmbad", "4": "Trinkwasser", "5": "Kühlen", "6": "Energie-Optimierung" } },
    // Domestic hot water status + current set temperature (as shown in the UI's DHW tab)
    { id: "drinkingWater.status",    point: "1593i", name: "Trinkwasser Status", role: "value",
      states: { "0": "Anforderung", "1": "Regenerativ", "2": "Spülzeit", "3": "Standzeit" } },
    { id: "drinkingWater.currentSetpoint", point: "1594i", name: "Trinkwasser Solltemperatur aktuell (inkl. Absenkung)", role: "value.temperature", unit: "°C", factor: 0.1 },
    // Warmwasser-Absenkung (internally "Sperre"): reduced WW target during these windows.
    // The active (reduced) target shows up in drinkingWater.currentSetpoint above.
    // Writable: enter as "HH:MM" -> writes hour + minute registers. Zeit 2 may read 00:00
    // (unused) but stays visible and configurable for later use.
    { id: "drinkingWater.setback.time1Start", time: ["1050i", "1051i"], type: "string", name: "Trinkwasser Absenkzeit 1 Start", role: "value", writable: true },
    { id: "drinkingWater.setback.time1End", time: ["1052i", "1053i"], type: "string", name: "Trinkwasser Absenkzeit 1 Ende",  role: "value", writable: true },
    { id: "drinkingWater.setback.time2Start", time: ["1054i", "1055i"], type: "string", name: "Trinkwasser Absenkzeit 2 Start", role: "value", writable: true },
    { id: "drinkingWater.setback.time2End", time: ["1056i", "1057i"], type: "string", name: "Trinkwasser Absenkzeit 2 Ende",  role: "value", writable: true },
    // Reduced target during the windows above (P_WW_MIN_TEMP). Verified live: reads 35 while
    // currentSetpoint shows 35 in a setback window. (1044i P_WW_SOLLAB reads 56 — not this.)
    { id: "drinkingWater.setback.temperature", point: "1045i", name: "Trinkwasser Absenktemperatur", role: "level.temperature", unit: "°C", type: "number", min: 10, max: 99, factor: 1, writable: true },
    // Heating (radiators, Heizkreis 1). currentSetpoint is the active heating target from the
    // heating curve incl. setback/raise; compare it with heatingWater.return.
    { id: "heatingWater.status",     point: "1573i", name: "Heizwasser Status", role: "value" },
    { id: "heatingWater.currentSetpoint", point: "1574i", name: "Heizwasser Solltemperatur aktuell (inkl. Absenkung/Anhebung)", role: "value.temperature", unit: "°C", factor: 0.1 },
    // Heizkreis 1 Absenkung / Anhebung: lower / raise the heating curve by `value` K during these windows.
    { id: "heatingWater.setback.time1Start", time: ["780i", "781i"], type: "string", name: "Heizwasser Absenkzeit 1 Start", role: "value", writable: true },
    { id: "heatingWater.setback.time1End", time: ["782i", "783i"], type: "string", name: "Heizwasser Absenkzeit 1 Ende",  role: "value", writable: true },
    { id: "heatingWater.setback.time2Start", time: ["784i", "785i"], type: "string", name: "Heizwasser Absenkzeit 2 Start", role: "value", writable: true },
    { id: "heatingWater.setback.time2End", time: ["786i", "787i"], type: "string", name: "Heizwasser Absenkzeit 2 Ende",  role: "value", writable: true },
    { id: "heatingWater.setback.value", point: "796i", name: "Heizwasser Absenkwert", role: "level", unit: "K", type: "number", min: 0, max: 19, factor: 1, writable: true },
    { id: "heatingWater.raise.time1Start", time: ["800i", "801i"], type: "string", name: "Heizwasser Anhebzeit 1 Start", role: "value", writable: true },
    { id: "heatingWater.raise.time1End", time: ["802i", "803i"], type: "string", name: "Heizwasser Anhebzeit 1 Ende",  role: "value", writable: true },
    { id: "heatingWater.raise.time2Start", time: ["804i", "805i"], type: "string", name: "Heizwasser Anhebzeit 2 Start", role: "value", writable: true },
    { id: "heatingWater.raise.time2End", time: ["806i", "807i"], type: "string", name: "Heizwasser Anhebzeit 2 Ende",  role: "value", writable: true },
    { id: "heatingWater.raise.value",   point: "815i", name: "Heizwasser Anhebwert", role: "level", unit: "K", type: "number", min: 0, max: 19, factor: 1, writable: true },
    { id: "status.powerStage",       point: "1260i", name: "Leistungsstufe Heizen (aktuell)", role: "value" },
    // Energy counters (kWh). The counter is a 12-digit number split across three 4-digit
    // registers; the real value = ST1bis4 + ST5bis8*1e4 + ST9bis12*1e8. These combined values
    // match the heat-pump CONTROLLER DISPLAY exactly (Heizen 10512, WW 12158, WP 22670,
    // Umwelt 17998). NOTE: the Dimplex *web* UI shows different, wrong numbers for these on
    // this firmware — the controller display (and thus this combine) is authoritative.
    { id: "energy.heatingWater",  combine: ["1663i", "1664i", "1665i"], name: "Wärmemenge Heizwasser (Heizen)",            role: "value.energy", unit: "kWh" },
    { id: "energy.drinkingWater", combine: ["1669i", "1670i", "1671i"], name: "Wärmemenge Trinkwasser",        role: "value.energy", unit: "kWh" },
    { id: "energy.generated",     combine: ["1660i", "1661i", "1662i"], name: "Wärmemenge Wärmepumpe gesamt", role: "value.energy", unit: "kWh" },
    { id: "energy.environmental", combine: ["1644i", "1645i", "1646i"], name: "Umweltenergie",                role: "value.energy", unit: "kWh" },
    { id: "runtime.compressor1",   point: "1380i", name: "Betriebsstunden Verdichter 1",   role: "value", unit: "h" },
    { id: "runtime.fan",           point: "1384i", name: "Betriebsstunden Ventilator",     role: "value", unit: "h" },
    { id: "runtime.heatingWaterPump", point: "1385i", name: "Betriebsstunden Heizwasser-Umwälzpumpe",  role: "value", unit: "h" },
    { id: "runtime.drinkingWaterPump", point: "1386i", name: "Betriebsstunden Trinkwasser-Ladepumpe", role: "value", unit: "h" },
    { id: "runtime.additionalPump", point: "1390i", name: "Betriebsstunden Zusatzpumpe",   role: "value", unit: "h" },
    { id: "runtime.immersionHeater", point: "1387i", name: "Betriebsstunden Tauchheizkörper", role: "value", unit: "h" },
    { id: "cycles.compressor1Total",    point: "1491i", name: "Schaltvorgänge Verdichter 1 gesamt",     role: "value" },
    { id: "cycles.compressor1HeatingWater", point: "1492i", name: "Schaltvorgänge Verdichter 1 Heizwasser",    role: "value" },
    { id: "cycles.compressor1DrinkingWater", point: "1493i", name: "Schaltvorgänge Verdichter 1 Trinkwasser", role: "value" },
];

// --- Control / full values: MQTT points (by name "<BMSIndex><type>") ---
// type: a = Analog, i = Integer, d = Digital. Integer points are MQTT-only.
const MQTT_POINTS = [
    { id: "drinkingWater.setpoint",        point: "1042i", name: "Trinkwasser Solltemperatur",      role: "level.temperature", unit: "°C", type: "number", min: 30,  max: 85,  factor: 1, writable: true },
    { id: "heatingWater.curveShift",       point: "767i",  name: "Heizwasser Heizkurve Parallelverschiebung (Wert-19 = K)", role: "level", type: "number", min: 0, max: 38, factor: 1, writable: true },
    { id: "heatingWater.curveEndpoint",    point: "766i",  name: "Heizwasser Heizkurvenendpunkt",          role: "level.temperature", unit: "°C", type: "number", min: 20,  max: 70,  factor: 1, writable: true },
    { id: "control.holidayDays",           point: "1108i", name: "Urlaubstage",                     role: "level", unit: "d", type: "number", min: 0, max: 150, factor: 1, writable: true },
    { id: "control.partyHours",            point: "715i",  name: "Partystunden",                    role: "level", unit: "h", type: "number", min: 0, max: 72, factor: 1, writable: true },
    { id: "control.operatingMode",         point: "714i",  name: "Betriebsart", role: "level.mode", type: "number", min: 0, max: 6, factor: 1, writable: true,
      states: { "0": "Sommer", "1": "Winter", "2": "Urlaub", "3": "Party", "4": "2. Wärmeerzeuger", "5": "Kühlung", "6": "Auto" } },
];

// Old state id -> new id (states regrouped by drinking water / heating water). On startup the
// adapter moves each old object's custom settings (e.g. InfluxDB logging) over and deletes it.
const RENAMED = {
    "temperatures.flow": "heatingWater.flow",
    "temperatures.return": "heatingWater.return",
    "temperatures.flowHeatPump": "heatingWater.flowHeatPump",
    "temperatures.hotWater": "drinkingWater.temperature",
    "status.heatingPump": "heatingWater.pump",
    "status.dhwCirculationPump": "drinkingWater.circulationPump",
    "status.dhwFlangeHeater": "drinkingWater.flangeHeater",
    "demand.heating": "heatingWater.demand",
    "demand.hotWater": "drinkingWater.demand",
    "heating.setback.active1": "heatingWater.setback.active1",
    "heating.setback.active2": "heatingWater.setback.active2",
    "hotWater.status": "drinkingWater.status",
    "hotWater.currentSetpoint": "drinkingWater.currentSetpoint",
    "hotWater.setback.time1Start": "drinkingWater.setback.time1Start",
    "hotWater.setback.time1End": "drinkingWater.setback.time1End",
    "hotWater.setback.time2Start": "drinkingWater.setback.time2Start",
    "hotWater.setback.time2End": "drinkingWater.setback.time2End",
    "hotWater.setback.temperature": "drinkingWater.setback.temperature",
    "heating.status": "heatingWater.status",
    "heating.currentSetpoint": "heatingWater.currentSetpoint",
    "energy.heating": "energy.heatingWater",
    "energy.hotWater": "energy.drinkingWater",
    "runtime.heatingPump": "runtime.heatingWaterPump",
    "runtime.hotWaterPump": "runtime.drinkingWaterPump",
    "cycles.compressor1Heating": "cycles.compressor1HeatingWater",
    "cycles.compressor1HotWater": "cycles.compressor1DrinkingWater",
    "control.hotWaterSetpoint": "drinkingWater.setpoint",
    "control.curveShiftHk1": "heatingWater.curveShift",
    "control.curveEndpointHk1": "heatingWater.curveEndpoint",
    "heating.setback.time1Start": "heatingWater.setback.time1Start",
    "heating.setback.time1End": "heatingWater.setback.time1End",
    "heating.setback.time2Start": "heatingWater.setback.time2Start",
    "heating.setback.time2End": "heatingWater.setback.time2End",
    "heating.setback.value": "heatingWater.setback.value",
    "heating.raise.time1Start": "heatingWater.raise.time1Start",
    "heating.raise.time1End": "heatingWater.raise.time1End",
    "heating.raise.time2Start": "heatingWater.raise.time2Start",
    "heating.raise.time2End": "heatingWater.raise.time2End",
    "heating.raise.value": "heatingWater.raise.value",
    // leftovers from the earlier hotWater.* rename
    "hotWater.setTemperature": "drinkingWater.currentSetpoint",
    "hotWater.setbackTime1Start": "drinkingWater.setback.time1Start",
    "hotWater.setbackTime1End": "drinkingWater.setback.time1End",
    "hotWater.setbackTime2Start": "drinkingWater.setback.time2Start",
    "hotWater.setbackTime2End": "drinkingWater.setback.time2End",
};

module.exports = { HOLDING, COILS, SMART_GRID, MQTT_MONITOR, MQTT_POINTS, RENAMED };
