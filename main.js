"use strict";

const utils = require("@iobroker/adapter-core");
const ModbusRTU = require("modbus-serial");
const { MqttClient } = require("./lib/mqttClient");
const { HOLDING, COILS, SMART_GRID, MQTT_MONITOR, MQTT_POINTS, RENAMED } = require("./lib/registers");

class WeishauptNwpmLocal extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: "weishaupt_nwpm_local" });
        this.modbus = null;
        this.mqtt = null;
        this.pollTimer = null;
        this.polling = false;
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync("info.connection", { val: false, ack: true });

        this.host = (this.config.host || "").trim();
        if (!this.host) {
            this.log.error("No gateway IP address configured — set it in the adapter settings.");
            return;
        }
        this.modbusPort = Number(this.config.modbusPort) || 502;
        this.deviceId = Number(this.config.deviceId) || 1;
        this.pollInterval = Math.max(5, Number(this.config.pollInterval) || 30);

        await this.createObjects();
        await this.migrateRenamedStates();

        // Writable states (control.*, drinkingWater.*, heatingWater.*) -> listen for changes.
        if (this.config.enableControl) {
            this.subscribeStates("*");
            await this.connectMqtt();
        }

        await this.poll();
        this.pollTimer = this.setInterval(() => this.poll(), this.pollInterval * 1000);
    }

    async createObjects() {
        // extendObject keeps the object's common in sync with the code across updates
        const mk = async (id, common) => {
            await this.extendObjectAsync(id, { type: "state", common, native: {} });
        };
        for (const r of HOLDING) {
            await mk(r.id, {
                name: r.name, type: "number", role: r.role, unit: r.unit || "",
                read: true, write: false,
            });
        }
        for (const r of COILS) {
            await mk(r.id, {
                name: r.name, type: "boolean", role: r.role, read: true, write: false,
            });
        }
        await mk(SMART_GRID.id, {
            name: SMART_GRID.name, type: "number", role: SMART_GRID.role, states: SMART_GRID.states,
            read: true, write: false,
        });
        if (this.config.enableControl) {
            for (const r of MQTT_MONITOR) {
                const common = {
                    name: r.name, type: r.type || "number", role: r.role, unit: r.unit || "",
                    read: true, write: false,
                };
                if (r.states) common.states = r.states;
                common.write = !!r.writable;
                await mk(r.id, common);
            }
            // Derived electrical energy + COP. This gateway exposes no electrical counter,
            // but energy balance gives it: electrical = generated - environmental.
            await mk("energy.electrical", { name: "Stromverbrauch (berechnet: erzeugt − Umwelt)", type: "number", role: "value.energy", unit: "kWh", read: true, write: false });
            await mk("energy.cop", { name: "Arbeitszahl JAZ (berechnet: erzeugt / Strom)", type: "number", role: "value", read: true, write: false });
            // Fault / lock history (from MQTT broadcast topics)
            await mk("history.errors", { name: "Fehler-Historie (JSON)", type: "string", role: "json", read: true, write: false });
            await mk("history.locks", { name: "Sperr-Historie (JSON)", type: "string", role: "json", read: true, write: false });
            await mk("history.lastErrorTime", { name: "Letzte Störung – Zeitpunkt", type: "string", role: "value.time", read: true, write: false });
            await mk("history.lastErrorCode", { name: "Letzte Störung – Code", type: "number", role: "value", read: true, write: false });
            await mk("history.lastLockTime", { name: "Letzte Sperre – Zeitpunkt", type: "string", role: "value.time", read: true, write: false });
            for (const r of MQTT_POINTS) {
                const common = {
                    name: r.name, type: r.type, role: r.role, unit: r.unit || "",
                    read: true, write: !!r.writable,
                    min: r.min, max: r.max,
                };
                if (r.states) common.states = r.states;
                await mk(r.id, common);
            }
        }
    }

    async readMqttPoint(r) {
        // Two registers (hour, minute) formatted as "HH:MM"
        if (r.time) {
            const h = await this.mqtt.read(r.time[0]);
            const mi = await this.mqtt.read(r.time[1]);
            if (h === null || h === undefined || mi === null || mi === undefined) return null;
            return `${String(Number(h)).padStart(2, "0")}:${String(Number(mi)).padStart(2, "0")}`;
        }
        // Multi-register counter split into 4-digit groups: ST1bis4 + ST5bis8*1e4 + ST9bis12*1e8
        if (r.combine) {
            let total = 0;
            for (let i = 0; i < r.combine.length; i++) {
                const v = await this.mqtt.read(r.combine[i]);
                if (v === null || v === undefined) return null;
                total += Number(v) * Math.pow(10, 4 * i);
            }
            return total;
        }
        const v = await this.mqtt.read(r.point);
        if (v === null || v === undefined) return null;
        let num = Number(v);
        if (isNaN(num)) return v;
        if (r.factor) num = Math.round(num * r.factor * 1000) / 1000;
        return num;
    }

    // States were regrouped under drinkingWater.* / heatingWater.*. Carry custom settings such as
    // InfluxDB logging over to the new object, then remove the old one.
    async migrateRenamedStates() {
        for (const [oldId, newId] of Object.entries(RENAMED)) {
            const oldObj = await this.getObjectAsync(oldId);
            if (!oldObj) continue;
            const custom = oldObj.common && oldObj.common.custom;
            const newObj = await this.getObjectAsync(newId);
            if (custom && newObj && !(newObj.common && newObj.common.custom)) {
                await this.extendObjectAsync(newId, { common: { custom } });
            }
            await this.delObjectAsync(oldId);
            this.log.info(`Renamed state ${oldId} -> ${newId}`);
        }
    }

    async connectModbus() {
        this.modbus = new ModbusRTU();
        this.modbus.setTimeout(5000);
        await this.modbus.connectTCP(this.host, { port: this.modbusPort });
        this.modbus.setID(this.deviceId);
    }

    async connectMqtt() {
        try {
            this.mqtt = new MqttClient({
                host: this.host,
                port: Number(this.config.mqttPort) || 61898,
                user: this.config.mqttUser || "mqtt",
                password: this.config.mqttPassword || "",
                log: this.log,
            });
            await this.mqtt.connect();
            this.log.info("MQTT control connected");
        } catch (e) {
            this.log.warn("MQTT control not available: " + e.message);
            if (this.mqtt) this.mqtt.close();
            this.mqtt = null;
        }
    }

    async poll() {
        if (this.polling) return;
        this.polling = true;
        try {
            if (!this.modbus || !this.modbus.isOpen) {
                await this.connectModbus();
            }
            for (const r of HOLDING) {
                const res = await this.modbus.readHoldingRegisters(r.addr, 1);
                let raw = res.data[0];
                if (raw > 32767) raw -= 65536; // signed 16-bit
                const val = Math.round(raw * (r.factor || 1) * 1000) / 1000; // avoid float noise
                await this.setStateChangedAsync(r.id, { val, ack: true });
            }
            for (const r of COILS) {
                const res = await this.modbus.readCoils(r.addr, 1);
                await this.setStateChangedAsync(r.id, { val: !!res.data[0], ack: true });
            }
            const sg = await this.modbus.readCoils(SMART_GRID.addr, Object.keys(SMART_GRID.states).length);
            const sgIndex = Object.keys(SMART_GRID.states).findIndex((_, i) => sg.data[i]);
            if (sgIndex >= 0) await this.setStateChangedAsync(SMART_GRID.id, { val: sgIndex, ack: true });
            await this.setStateAsync("info.connection", { val: true, ack: true });

            if (this.config.enableControl && this.mqtt && this.mqtt.connected) {
                let eGenerated = null, eEnvironmental = null;
                for (const r of [...MQTT_MONITOR, ...MQTT_POINTS]) {
                    const val = await this.readMqttPoint(r);
                    if (val === null || val === undefined) continue;
                    if (r.id === "energy.generated") eGenerated = Number(val);
                    if (r.id === "energy.environmental") eEnvironmental = Number(val);
                    await this.setStateChangedAsync(r.id, { val, ack: true });
                }
                // Derived: electrical energy consumed = produced heat - environmental heat.
                if (eGenerated !== null && eEnvironmental !== null) {
                    let electrical = Math.round((eGenerated - eEnvironmental) * 1000) / 1000;
                    // Both inputs are whole-kWh counters ticking independently, so the difference
                    // jitters by ±1 kWh (e.g. 4673 -> 4672 -> 4673). Ignore drops of <= 1 kWh to keep
                    // the counter monotonic; larger drops (counter reset) still pass through.
                    if (this.lastElectrical === undefined) {
                        const st = await this.getStateAsync("energy.electrical");
                        this.lastElectrical = st && typeof st.val === "number" ? st.val : null;
                    }
                    if (this.lastElectrical !== null && electrical < this.lastElectrical && electrical >= this.lastElectrical - 1) {
                        electrical = this.lastElectrical;
                    }
                    this.lastElectrical = electrical;
                    await this.setStateChangedAsync("energy.electrical", { val: electrical, ack: true });
                    if (electrical > 0) {
                        await this.setStateChangedAsync("energy.cop", { val: Math.round((eGenerated / electrical) * 100) / 100, ack: true });
                    }
                }
                await this.updateHistory();
            }
        } catch (e) {
            this.log.debug("Poll error: " + e.message);
            await this.setStateAsync("info.connection", { val: false, ack: true });
            if (this.modbus) {
                try { this.modbus.close(() => {}); } catch { /* ignore */ }
                this.modbus = null;
            }
        } finally {
            this.polling = false;
        }
    }

    async updateHistory() {
        const errRaw = this.mqtt.getBroadcast("error_history_state");
        if (errRaw) {
            await this.setStateChangedAsync("history.errors", { val: errRaw, ack: true });
            try {
                const a = JSON.parse(errRaw);
                if (a[0]) {
                    await this.setStateChangedAsync("history.lastErrorTime", { val: a[0].time, ack: true });
                    await this.setStateChangedAsync("history.lastErrorCode", { val: Number(a[0].err_value), ack: true });
                }
            } catch { /* ignore malformed history */ }
        }
        const lockRaw = this.mqtt.getBroadcast("lock_history_state");
        if (lockRaw) {
            await this.setStateChangedAsync("history.locks", { val: lockRaw, ack: true });
            try {
                const a = JSON.parse(lockRaw);
                if (a[0]) await this.setStateChangedAsync("history.lastLockTime", { val: a[0].time, ack: true });
            } catch { /* ignore */ }
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return; // only react to user-initiated changes
        if (!this.config.enableControl || !this.mqtt || !this.mqtt.connected) {
            this.log.warn("Cannot write: control/MQTT not enabled or not connected");
            return;
        }
        const key = id.split(".").slice(2).join(".");
        const entry = [...MQTT_MONITOR, ...MQTT_POINTS].find((p) => p.id === key);
        if (!entry || !entry.writable) return;

        // Time points: value "HH:MM" -> write hour + minute registers
        if (entry.time) {
            const m = String(state.val).match(/^(\d{1,2}):(\d{2})$/);
            if (!m) {
                this.log.warn(`Invalid time "${state.val}" for ${entry.name} (use HH:MM)`);
                return;
            }
            const hh = Math.min(23, Math.max(0, Number(m[1])));
            const mm = Math.min(59, Math.max(0, Number(m[2])));
            const r1 = await this.mqtt.write(entry.time[0], hh);
            const r2 = await this.mqtt.write(entry.time[1], mm);
            if (r1 && r1.status === 0 && r2 && r2.status === 0) {
                await this.setStateAsync(id, {
                    val: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, ack: true,
                });
                this.log.info(`Set ${entry.name} = ${hh}:${mm}`);
            } else {
                this.log.warn(`Write ${entry.name} failed`);
            }
            return;
        }

        const point = entry;
        let value = state.val;
        if (point.type === "number") {
            value = Number(value);
            if (point.min !== undefined && value < point.min) value = point.min;
            if (point.max !== undefined && value > point.max) value = point.max;
        }
        const res = await this.mqtt.write(point.point, value);
        if (res && res.status === 0) {
            await this.setStateAsync(id, { val: value, ack: true });
            this.log.info(`Set ${point.name} = ${value}`);
        } else {
            this.log.warn(`Write ${point.name} failed: ${res ? JSON.stringify(res) : "no reply"}`);
        }
    }

    onUnload(callback) {
        try {
            if (this.pollTimer) this.clearInterval(this.pollTimer);
            if (this.mqtt) this.mqtt.close();
            if (this.modbus) {
                try { this.modbus.close(() => {}); } catch { /* ignore */ }
            }
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new WeishauptNwpmLocal(options);
} else {
    new WeishauptNwpmLocal();
}
