"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const json = (f) => JSON.parse(read(f));

test("package.json and io-package.json are consistent", () => {
    const pkg = json("package.json");
    const io = json("io-package.json");
    assert.strictEqual(pkg.name, "iobroker." + io.common.name);
    assert.strictEqual(pkg.version, io.common.version);
    assert.strictEqual(pkg.main, io.common.main);
});

test("no credentials or personal data are committed", () => {
    const files = [
        "main.js", "io-package.json", "package.json",
        "admin/jsonConfig.json", "lib/registers.js", "lib/mqttClient.js", "README.md",
    ];
    // Generic shapes that should never appear hardcoded (no real secret embedded here).
    const macLike = /\b[0-9a-f]{2}(:[0-9a-f]{2}){5}\b/i;              // any MAC address
    const hardcodedPw = /(password|passwd|pwd)\s*[:=]\s*["'][^"']+["']/i; // non-empty literal
    for (const f of files) {
        const content = read(f);
        assert.ok(!macLike.test(content), `${f} contains a hardcoded MAC address`);
        assert.ok(!hardcodedPw.test(content), `${f} contains a hardcoded password literal`);
    }
    const io = json("io-package.json");
    assert.strictEqual(io.native.mqttPassword, "", "mqttPassword default must be empty");
    assert.strictEqual(io.native.host, "", "host default must be empty");
    assert.ok(io.encryptedNative.includes("mqttPassword"), "mqttPassword must be encrypted");
});
