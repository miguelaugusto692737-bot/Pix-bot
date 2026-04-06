# Workspace

## Overview

pnpm workspace monorepo usando TypeScript. Bot do Discord com pagamento Pix.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Discord bot**: discord.js v14
- **Pix**: geração de payload EMV + QR Code (qrcode)

## Funcionalidades

### Bot do Discord — Pix
- Comando `/pix [valor] [descricao]` — gera QR Code e código copia-e-cola Pix
- Funciona em todos os bancos brasileiros (Nubank, Inter, Itaú, etc.)
- Payload EMV/Pix seguindo especificação do Banco Central
- QR Code enviado como imagem no Discord

### Configuração necessária
- `DISCORD_TOKEN` (secret) — Token do bot Discord
- `PIX_KEY` (env var) — Sua chave Pix (EVP/aleatória, CPF, e-mail, etc.)
- `PIX_RECIPIENT_NAME` (env var) — Nome do recebedor (padrão: "Joao")
- `PIX_RECIPIENT_CITY` (env var) — Cidade do recebedor (padrão: "SAO PAULO")

### Como convidar o bot
Acesse: `https://discord.com/api/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=2147483648&scope=bot%20applications.commands`
Substitua `SEU_CLIENT_ID` pelo ID do seu app em discord.com/developers/applications

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally (also starts Discord bot)

## File Structure

- `artifacts/api-server/src/bot/pix.ts` — geração do payload Pix (EMV QR Code + CRC16)
- `artifacts/api-server/src/bot/discord.ts` — bot Discord (comando /pix)
- `artifacts/api-server/src/index.ts` — entry point (Express + Discord bot)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
