import { spawn } from "node:child_process";
import electron from "electron";

const vite = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

const url = "http://127.0.0.1:5173";

async function waitForVite() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for Vite.");
}

try {
  await waitForVite();
  const app = spawn(electron, ["--no-sandbox", "."], {
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });

  app.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(error);
  vite.kill();
  process.exit(1);
}
