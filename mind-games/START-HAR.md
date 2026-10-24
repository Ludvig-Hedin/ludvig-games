# Mind Games: starta här

Spelet finns live på https://mind-games.ludvighedin.com/ som en egen Cloudflare Worker med en egen D1-databas (`mind-games`).

## Köra lokalt

Kräver Node.js 22.13 eller senare.

```sh
npm install
npm run db:migrate:local
npm run dev
```

Öppna http://localhost:5173.

## Bygga och publicera

```sh
npx vinext build
npx wrangler deploy --config dist/server/wrangler.json
```

Kör `npx wrangler d1 migrations apply mind-games --remote` bara när `drizzle/` har en ny migrering. Mer om regler, AI och onlinerum finns i `README.md`.
