/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS worker script */
// Runs one Stockfish build in its own thread, like a Web Worker in the browser, and speaks
// UCI over messages. Used by the benchmark: the single-thread build otherwise runs in the
// calling thread, which would serialize several "parallel" engines.
const { parentPort, workerData } = require("node:worker_threads");
const { findEngine } = require("stockfish");

const engine = require(findEngine(workerData.flavor))();
engine.listener = (line) => parentPort.postMessage(line);
parentPort.on("message", (command) => engine.processCommand(command));
