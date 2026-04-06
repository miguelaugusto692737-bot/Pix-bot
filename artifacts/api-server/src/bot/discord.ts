import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, pixConfigTable } from "@workspace/db";
import { generatePixPayload } from "./pix.js";
import { logger } from "../lib/logger.js";

const DISCORD_TOKEN = process.env["DISCORD_TOKEN"] ?? "";

const commands = [
  new SlashCommandBuilder()
    .setName("pix")
    .setDescription("Gera um QR Code e código Pix com a sua chave configurada")
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

  new SlashCommandBuilder()
    .setName("configurar-pix")
    .setDescription("(Somente admin) Configure sua chave Pix para receber pagamentos")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("chave")
        .setDescription("Sua chave Pix (aleatória, CPF, e-mail ou telefone)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("nome")
        .setDescription("Seu nome que aparecerá no Pix (máx. 25 caracteres)")
        .setRequired(true)
        .setMaxLength(25)
    )
    .addStringOption((opt) =>
      opt
        .setName("cidade")
        .setDescription("Sua cidade (máx. 15 caracteres, padrão: SAO PAULO)")
        .setRequired(false)
        .setMaxLength(15)
    )
    .toJSON(),
];

async function getUserConfig(userId: string) {
  const rows = await db
    .select()
    .from(pixConfigTable)
    .where(eq(pixConfigTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function handleConfigurarPix(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const chave = interaction.options.getString("chave", true);
  const nome = interaction.options.getString("nome", true);
  const cidade = interaction.options.getString("cidade") ?? "SAO PAULO";

  await db
    .insert(pixConfigTable)
    .values({
      userId: interaction.user.id,
      pixKey: chave,
      recipientName: nome,
      recipientCity: cidade,
    })
    .onConflictDoUpdate({
      target: pixConfigTable.userId,
      set: {
        pixKey: chave,
        recipientName: nome,
        recipientCity: cidade,
        updatedAt: new Date(),
      },
    });

  await interaction.editReply(
    `✅ **Pix configurado com sucesso!**\n\n` +
    `👤 **Nome:** ${nome}\n` +
    `🏙️ **Cidade:** ${cidade}\n` +
    `🔑 **Chave:** \`${chave}\`\n\n` +
    `_Agora use \`/pix\` para gerar suas cobranças. Apenas você está vendo esta mensagem._`
  );
}

async function handlePix(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const config = await getUserConfig(interaction.user.id);

  if (!config) {
    await interaction.editReply(
      `⚠️ Você ainda não configurou sua chave Pix.\n` +
      `Use o comando \`/configurar-pix\` para configurar a sua chave e começar a receber pagamentos.`
    );
    return;
  }

  const amount = interaction.options.getNumber("valor") ?? undefined;
  const description = interaction.options.getString("descricao") ?? undefined;

  const payload = generatePixPayload({
    key: config.pixKey,
    name: config.recipientName,
    city: config.recipientCity,
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

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "💰 Valor", value: valorStr, inline: true },
    { name: "👤 Recebedor", value: config.recipientName, inline: true },
  ];

  if (description) {
    fields.push({ name: "📝 Descrição", value: description, inline: false });
  }

  const embed = {
    color: 0x32bcad,
    title: "🟢 Cobrança Pix",
    description: `Cobrança gerada por <@${interaction.user.id}>. Escaneie o QR Code com qualquer banco ou copie o código abaixo.`,
    fields,
    image: { url: "attachment://pix-qrcode.png" },
    footer: { text: "Pix — Disponível 24h em todos os bancos" },
  };

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
    } else if (interaction.commandName === "configurar-pix") {
      await handleConfigurarPix(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar comando /configurar-pix");
      });
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Erro no cliente Discord");
  });

  await client.login(DISCORD_TOKEN);
}
