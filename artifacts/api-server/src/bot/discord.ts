import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import QRCode from "qrcode";
import { generatePixPayload } from "./pix.js";
import { logger } from "../lib/logger.js";

const PIX_KEY = process.env["PIX_KEY"] ?? "";
const PIX_NAME = process.env["PIX_RECIPIENT_NAME"] ?? "Destinatario";
const PIX_CITY = process.env["PIX_RECIPIENT_CITY"] ?? "SAO PAULO";
const DISCORD_TOKEN = process.env["DISCORD_TOKEN"] ?? "";

const commands = [
  new SlashCommandBuilder()
    .setName("pix")
    .setDescription("Gera um QR Code e código Pix para receber pagamento")
    .addNumberOption((opt) =>
      opt
        .setName("valor")
        .setDescription("Valor em reais (ex: 29.90). Deixe vazio para valor livre.")
        .setRequired(false)
        .setMinValue(0.01)
    )
    .addStringOption((opt) =>
      opt
        .setName("descricao")
        .setDescription("Descrição do pagamento (opcional)")
        .setRequired(false)
        .setMaxLength(72)
    )
    .toJSON(),
];

async function handlePix(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  if (!PIX_KEY || PIX_KEY === "SUA_CHAVE_PIX_AQUI") {
    await interaction.editReply(
      "⚠️ Chave Pix não configurada. Defina a variável de ambiente `PIX_KEY` com sua chave Pix."
    );
    return;
  }

  const amount = interaction.options.getNumber("valor") ?? undefined;
  const description = interaction.options.getString("descricao") ?? undefined;

  const payload = generatePixPayload({
    key: PIX_KEY,
    name: PIX_NAME,
    city: PIX_CITY,
    amount,
    description,
  });

  let qrBuffer: Buffer;
  try {
    qrBuffer = await QRCode.toBuffer(payload, {
      errorCorrectionLevel: "M",
      type: "png",
      scale: 8,
      margin: 2,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao gerar QR Code");
    await interaction.editReply("❌ Erro ao gerar QR Code. Tente novamente.");
    return;
  }

  const attachment = new AttachmentBuilder(qrBuffer, { name: "pix-qrcode.png" });

  const valorStr = amount !== undefined
    ? `R$ ${amount.toFixed(2).replace(".", ",")}`
    : "Valor livre";

  const descStr = description ? `\n📝 **Descrição:** ${description}` : "";

  const embed = {
    color: 0x32bcad,
    title: "🟢 Cobrança Pix",
    description: `Escaneie o QR Code com qualquer banco (Nubank, Inter, Itaú, etc.) ou copie o código abaixo.`,
    fields: [
      { name: "💰 Valor", value: valorStr, inline: true },
      { name: "👤 Recebedor", value: PIX_NAME, inline: true },
    ],
    image: { url: "attachment://pix-qrcode.png" },
    footer: { text: "Pix — Disponível 24h em todos os bancos" },
  };

  if (descStr) {
    embed.fields.push({ name: "📝 Descrição", value: description!, inline: false });
  }

  await interaction.editReply({
    embeds: [embed],
    files: [attachment],
  });

  await interaction.followUp({
    content: `**Código Pix (Copia e Cola):**\n\`\`\`\n${payload}\n\`\`\``,
    ephemeral: false,
  });
}

export async function startDiscordBot(): Promise<void> {
  if (!DISCORD_TOKEN) {
    logger.warn("DISCORD_TOKEN não definido — bot do Discord não iniciado.");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("clientReady", async (c) => {
    logger.info({ tag: c.user.tag }, "Bot do Discord conectado");

    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
    try {
      await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
      logger.info("Comandos slash registrados globalmente");
    } catch (err) {
      logger.error({ err }, "Erro ao registrar comandos slash");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "pix") {
      await handlePix(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar comando /pix");
      });
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Erro no cliente Discord");
  });

  await client.login(DISCORD_TOKEN);
}
