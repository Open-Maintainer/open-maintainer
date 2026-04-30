const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3000";

async function waitFor(url: string, label: string) {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

await waitFor(`${apiBaseUrl}/health`, "API");
await waitFor(webBaseUrl, "Web dashboard");

const heartbeat = await fetch(`${apiBaseUrl}/worker/heartbeat`, {
  method: "POST",
});
if (!heartbeat.ok) {
  throw new Error(`Worker heartbeat failed with HTTP ${heartbeat.status}`);
}

const health = await (await fetch(`${apiBaseUrl}/health`)).json();
if (
  health.database !== "ok" ||
  health.redis !== "ok" ||
  health.worker !== "ok"
) {
  throw new Error(`Compose smoke failed: ${JSON.stringify(health)}`);
}

console.log("Docker Compose smoke passed.");
