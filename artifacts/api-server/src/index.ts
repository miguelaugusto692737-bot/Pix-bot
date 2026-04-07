import app from "./app";
import { logger } from "./lib/logger";
import { startDiscordBot } from "./bot/discord.js";

app.get("/", (req, res) => {
  res.send("Bot online!");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error({ port }, `Porta ${port} já está em uso. Encerrando.`);
  } else {
    logger.error({ err }, "Erro ao iniciar o servidor");
  }
  process.exit(1);
});

startDiscordBot().catch((err) => {
  logger.error({ err }, "Falha ao iniciar bot do Discord");
});
