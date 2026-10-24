let tick = 0;

setInterval(() => {
  tick += 1;
  console.log(`[demo-worker] heartbeat #${tick} at ${new Date().toISOString()}`);
}, 2000);

console.log('demo-worker started (no port, background loop) — good example of a headless app in Loki.');
