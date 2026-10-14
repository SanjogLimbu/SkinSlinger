import { getBaseUrl } from '../lib/site'

// llms.txt — a machine-readable site summary for AI/answer engines (GEO).
// Plain markdown, stable facts, canonical URLs.

export async function GET() {
    const base = getBaseUrl()

    const body = `# SkinSlinger

> SkinSlinger is a peer-to-peer (P2P) Steam skins marketplace with no KYC (no identity verification), 0% sales fee, and crypto payments (USDC on the Polygon network). It supports CS2 (Counter-Strike 2), Dota 2, Rust, and Team Fortress 2 (TF2).

## Key facts

- No KYC at any point: not at sign-up, not for trading, not for withdrawals. Login is via Steam only.
- Fees: 0% sales fee, 0% deposit fee, 0% FX fee. Withdrawal fee starts at 2.5% and falls to 0.5% with trade volume ($100 -> 2%, $1,000 -> 1.5%, $5,000 -> 1.0%, $25,000 -> 0.5%).
- Payments: USDC on the Polygon network. Deposits and withdrawals typically confirm in under 5 minutes.
- Trades are peer-to-peer Steam trades between players with escrowed payment: the buyer pays, the seller sends a Steam trade offer, the server verifies delivery (checks the buyer's inventory every 5 minutes), then funds are released to the seller.
- Sellers keep 100% of the listed price. Buyers trade directly with other players, not with bots.

## Main pages

- [CS2 market](${base}/market/cs2): Buy and sell CS2 skins with crypto.
- [Dota 2 market](${base}/market/dota2): Buy and sell Dota 2 items for real money.
- [Rust market](${base}/market/rust): Buy and sell Rust skins with crypto.
- [TF2 market](${base}/market/tf2): Sell TF2 items, unusuals, and keys for real money.
- [Blog](${base}/blog): Guides on selling skins for crypto, fees, float values, and no-KYC trading.

## Comparison

Typical combined fees elsewhere: Steam Community Market 15% (proceeds locked as Steam Wallet credit), Skinport ~8%, CS.Money ~7%, DMarket ~9.5%, CSFloat ~5.3%. SkinSlinger's total cost is the withdrawal fee only (2.5% falling to 0.5%).

## Contact

- Support: support@skinslinger.com
- Business: management@skinslinger.com
`

    return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
}
