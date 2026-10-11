"use strict";

const mqtt = require("mqtt");
const crypto = require("crypto");

const REQ_READ = "gateway/modbus/get_value/readrequest";
const REQ_WRITE = "gateway/modbus/set_value/writerequest";

/**
 * Minimal client for the NWPM gateway's MQTT interface (secure WebSocket).
 * Reads/writes data points by name ("<BMSIndex><type>", e.g. "1042i").
 */
class MqttClient {
    constructor({ host, port, user, password, log }) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.log = log;
        this.cid = "dimplex_web_client-" + crypto.randomUUID();
        this.respRead = `extern/${this.cid}/get_value_reply/readrequestresult`;
        this.respWrite = `extern/${this.cid}/set_value_reply/writerequestresult`;
        this._pending = new Map();
        this.broadcasts = {}; // latest payload per extern/broadcast/* topic
        this.client = null;
    }

    getBroadcast(name) {
        return this.broadcasts["extern/broadcast/" + name] || null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const url = `wss://${this.host}:${this.port}`;
            this.client = mqtt.connect(url, {
                clientId: this.cid,
                username: this.user,
                password: this.password,
                protocolVersion: 4,
                reconnectPeriod: 10000,
                connectTimeout: 30000,
                rejectUnauthorized: false, // gateway uses a self-signed certificate
                wsOptions: {
                    rejectUnauthorized: false,
                    headers: { "Sec-WebSocket-Protocol": "mqtt" },
                },
            });
            this.client.on("connect", () => {
                this.client.subscribe([
                    this.respRead,
                    this.respWrite,
                    "extern/broadcast/error_history_state",
                    "extern/broadcast/lock_history_state",
                ], () => resolve());
            });
            this.client.on("message", (topic, payload) => this._onMessage(topic, payload));
            this.client.on("error", (err) => {
                this.log && this.log.debug("MQTT error: " + err.message);
            });
            setTimeout(() => {
                if (!this.client || !this.client.connected) {
                    reject(new Error("MQTT connect timeout (wrong password or services disabled?)"));
                }
            }, 30000);
        });
    }

    _onMessage(topic, payload) {
        const txt = payload.toString();
        if (topic.startsWith("extern/broadcast/")) {
            this.broadcasts[topic] = txt; // store latest (error/lock history etc.)
            return;
        }
        let data;
        try {
            data = JSON.parse(txt);
        } catch {
            return;
        }
        const content = (data && data.content) || data;
        if (!content || !content.name) return;
        const resolver = this._pending.get(content.name);
        if (resolver) {
            this._pending.delete(content.name);
            resolver(content);
        }
    }

    _request(topic, msg, name, timeout) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this._pending.delete(name);
                resolve(null);
            }, timeout);
            this._pending.set(name, (content) => {
                clearTimeout(timer);
                resolve(content);
            });
            this.client.publish(topic, JSON.stringify(msg));
        });
    }

    async read(name, timeout = 5000) {
        const content = await this._request(
            REQ_READ,
            { name, mqtt_msg_properties: { correlation_data: 0, response_topic: this.respRead } },
            name,
            timeout,
        );
        if (!content || content.value === undefined) return null;
        return Array.isArray(content.value) ? content.value[0] : content.value;
    }

    async write(name, value, timeout = 5000) {
        return this._request(
            REQ_WRITE,
            {
                name,
                value: [String(value)],
                mqtt_msg_properties: { correlation_data: 0, response_topic: this.respWrite },
            },
            name,
            timeout,
        );
    }

    get connected() {
        return !!(this.client && this.client.connected);
    }

    close() {
        if (this.client) {
            try {
                this.client.end(true);
            } catch {
                /* ignore */
            }
            this.client = null;
        }
    }
}

module.exports = { MqttClient };
