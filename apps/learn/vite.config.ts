import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => {
  const configuredPort = process.env.PORT ? Number(process.env.PORT) : undefined;
  if (command === "serve" && (!configuredPort || !Number.isInteger(configuredPort))) {
    throw new Error("PORT is required; resolve txline-kit-dev-web or txline-kit-test-web with port-for");
  }
  return {
    plugins: react(),
    ...(configuredPort ? {
      server: { host: "127.0.0.1", port: configuredPort, strictPort: true },
      preview: { host: "127.0.0.1", port: configuredPort, strictPort: true },
    } : {}),
  };
});
