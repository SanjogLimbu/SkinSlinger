# SkinSlinger

A full-stack peer-to-peer marketplace for Steam game items (CS2, Dota 2, Rust, TF2).

Users log in via Steam OAUTH, list items from their inventory, and buy from each other using a USDC balance on Polygon. There is no middleman bot holding items: the seller trades the item to the buyer directly, and the server only releases payment when it can verify the item arrived and cannot be reverted.

## Tech stack

| Layer | Technology | Used for |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19 | Server-rendered pages and API route handlers |
| Language | TypeScript 5 | Whole codebase except the browser extension |
| Styling | Tailwind CSS 4 | All UI styling |
| Database | PostgreSQL, Prisma 7 (`pg` driver adapter) | Users, listings, purchases, buy orders, deposits, cached prices |
| Auth | NextAuth 4, `next-auth-steam`, Prisma adapter | Steam sign-in with JWT sessions |
| Blockchain | viem, Polygon, Alchemy RPC | USDC deposits, sweeps and withdrawals, HD wallet deposit addresses |
| Steam data | steamwebapi.com, Steam Community Market | Inventories, trade eligibility, item prices and price history |
| Email | Resend, React email templates | Email verification and trade notifications |
| Background jobs | Vercel Cron | Processing deposits and purchases, refreshing prices, removing stale listings |
| Browser extension | Chrome Manifest V3, plain JavaScript | Filling Steam trade offers and reporting their status |
| Charts | Hand-written SVG | Price history chart on item pages |
| Hosting | Vercel, Vercel Analytics | Deployment and page analytics |
| Testing | Vitest 5, GitHub Actions | Unit tests for pricing, delivery verification and trade checks |
| Tooling | ESLint 9 | Linting |

## What it does

- Browse and buy: server-rendered market pages per game with search, infinite scroll, item detail pages (float, pattern and sticker data for CS2), a basket, and checkout.
- Sell from your Steam inventory: the inventory loads live from Steam, prices are obtained from the database or are fetched live and cached, and items can be listed or repriced at any time.
- Buy orders: users can place buy orders for skins with cash reserved up front. A new listing is matched against the best bid automatically.
- Order tracking: buyers and sellers follow each purchase through delivery with optional email notifications.
- Crypto wallet: deposit USDC to a temporary one-time address, withdraw to any wallet.
- Seller browser extension: automatically adds the right items to the Steam trade offer and reports trade status back to the site's backend.
- Pricing algorithm: prices of items are calculated using an average of the prices from other popular marketplaces. Prices are cached and updated weekly via a cron job.

## Payment  flow
### Verifying delivery when the ID changes

The first version checked the buyer's inventory for the item's asset ID but it never matched as Steam automatically changes the asset ID of the item when the item is traded. The fix was to match on persistent properties. For CS2 skins that means the exact float value and paint seed. For stackable items it falls back to name matching.

### Protecting buyers from trade reversals

Steam allows a sender to reverse a trade for about 7 days. Without protection, a seller could deliver the item, get paid, and then contact Steam support to reverse the trade to get their item back. Payment is therefore held for 8 days after delivery (the reason why it's 8 and not 7 is because the API takes time to update). The server then checks again: if the item is still with the buyer, the seller is paid; if it's gone, the buyer is refunded.

### Crypto deposits

- Each deposit gets a fresh unique address from a HD wallet (BIP-32 derivation), so payments can be attributed without asking users to include a memo.
- A cron job scans USDC `Transfer` event logs for those addresses and resumes from the last processed block.
- Funds are swept to the main wallet. When a deposit address has no gas, the main wallet sends it a small amount of POL first so that the transaction can occur.
- Users are credited with the amount that actually arrived, not the amount they said they'd send. A sweep which fails is retried on the next run.
- Withdrawals deduct the balance first and refund it if the on-chain transfer fails to protect against crashes giving free balance.

### Browser extension

Steam does not offer a public API for sending trade offers from a user's account, so the extension is required. It works inside the seller's logged-in browser and it fills the trade offer with the correct items automatically, but it never clicks send. The user manually verifies the items and sends the trade themselves. Every 5 minutes the extension reads the seller's sent-offers page and reports to the backend whether each offer is active, gone or accepted. When an order is cancelled on the site, its trade offer is queued, and the extension cancels it on Steam. 

