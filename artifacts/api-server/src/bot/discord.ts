import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, pixConfigTable, guildConfigTable } from "@workspace/db";
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
    .setDescription("Configure sua chave Pix para receber pagamentos")
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

  new SlashCommandBuilder()
    .setName("configurar-cargo")
    .setDescription("(Somente admin) Define qual cargo pode usar /pix e /configurar-pix")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt
        .setName("cargo")
        .setDescription("Cargo autorizado a usar os comandos Pix")
        .setRequired(true)
    )
    .toJSON(),
];

async function getGuildConfig(guildId: string) {
  const rows = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, guildId))
    .limit(1);
  return rows[0] ?? null;
}

async function getUserConfig(userId: string) {
  const rows = await db
    .select()
    .from(pixConfigTable)
    .where(eq(pixConfigTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function isAuthorized(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const member = interaction.member;
  if (!member || !(member instanceof GuildMember)) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const guildId = interaction.guildId;
  if (!guildId) return false;

  const guildConfig = await getGuildConfig(guildId);
  if (!guildConfig) return false;

  return member.roles.cache.has(guildConfig.allowedRoleId);
}

async function handleConfigurarCargo(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guildId) {
    await interaction.editReply("❌ Este comando só pode ser usado dentro de um servidor.");
    return;
  }

  const role = interaction.options.getRole("cargo", true);

  await db
    .insert(guildConfigTable)
    .values({
      guildId: interaction.guildId,
      allowedRoleId: role.id,
      configuredBy: interaction.user.id,
    })
    .onConflictDoUpdate({
      target: guildConfigTable.guildId,
      set: {
        allowedRoleId: role.id,
        configuredBy: interaction.user.id,
        updatedAt: new Date(),
      },
    });

  await interaction.editReply(
    `✅ **Cargo configurado!**\n\n` +
    `O cargo <@&${role.id}> agora pode usar os comandos \`/pix\` e \`/configurar-pix\`.\n` +
    `Membros sem esse cargo e sem ser administrador não terão acesso.\n\n` +
    `_Apenas você está vendo esta mensagem._`
  );
}

async function handleConfigurarPix(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const authorized = await isAuthorized(interaction);
  if (!authorized) {
    await interaction.editReply(
      "🚫 Você não tem permissão para usar este comando.\n" +
      "Apenas administradores ou membros com o cargo autorizado podem configurar o Pix."
    );
    return;
  }

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
  await interaction.deferReply({ ephemeral: false });

  const authorized = await isAuthorized(interaction);
  if (!authorized) {
    await interaction.editReply({
      content:
        "🚫 Você não tem permissão para usar este comando.\n" +
        "Apenas administradores ou membros com o cargo autorizado podem usar o Pix.",
    });
    return;
  }

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
      scale: 3,
      margin: 1,
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
    content: `**Código Pix (Copia e Cola):**\n\`\`\`\n${payload}\n\`\`\``,
    embeds: [embed],
    files: [attachment],
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
    } else if (interaction.commandName === "configurar-cargo") {
      await handleConfigurarCargo(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar comando /configurar-cargo");
      });
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Erro no cliente Discord");
  });

  await client.login(DISCORD_TOKEN);
}
