"use strict";

const utils = require("@iobroker/adapter-core");
const ModbusRTU = require("modbus-serial");
const { MqttClient } = require("./lib/mqttClient");
const { HOLDING, COILS, MQTT_MONITOR, MQTT_POINTS } = require("./lib/registers");

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

        // Control states are writable -> listen for changes.
        if (this.config.enableControl) {
            this.subscribeStates("control.*");
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
        if (this.config.enableControl) {
            for (const r of MQTT_MONITOR) {
                const common = {
                    name: r.name, type: "number", role: r.role, unit: r.unit || "",
                    read: true, write: false,
                };
                if (r.states) common.states = r.states;
                await mk(r.id, common);
            }
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
        const v = await this.mqtt.read(r.point);
        if (v === null || v === undefined) return null;
        let num = Number(v);
        if (isNaN(num)) return v;
        if (r.factor) num = Math.round(num * r.factor * 1000) / 1000;
        return num;
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
            await this.setStateAsync("info.connection", { val: true, ack: true });

            if (this.config.enableControl && this.mqtt && this.mqtt.connected) {
                for (const r of [...MQTT_MONITOR, ...MQTT_POINTS]) {
                    const val = await this.readMqttPoint(r);
                    if (val === null || val === undefined) continue;
                    await this.setStateChangedAsync(r.id, { val, ack: true });
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
        const point = MQTT_POINTS.find((p) => p.id === key);
        if (!point || !point.writable) return;

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
