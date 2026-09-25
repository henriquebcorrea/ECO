import { defineConfig, loadEnv } from "vite";

function saoPauloToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: {
      __ECO_PILOT_START_DATE__: JSON.stringify(env.VITE_PILOT_START_DATE || saoPauloToday()),
    },
  };
});
