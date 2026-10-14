type Rarity = { key: string, label: string, hex: string }

//

// Card background in a rarity colour, with a spotlight `spotlightY` percent down
export function rarityBackground(hexColor: string, spotlightY: number): string {
    return `radial-gradient(circle at 50% ${spotlightY}%, #${hexColor}40, transparent 58%), linear-gradient(to bottom, #${hexColor}66, var(--color-accent) 42%, var(--color-secondary))`
}

//

// Rarity tiers per game, lowest first. A listing's hexColor is its rarity colour.
export const RARITIES: Record<string, Rarity[]> = {
    CS2: [
        { key: "consumer", label: "Consumer", hex: "b0c3d9" },
        { key: "industrial", label: "Industrial", hex: "5e98d9" },
        { key: "milspec", label: "Mil-Spec", hex: "4b69ff" },
        { key: "restricted", label: "Restricted", hex: "8847ff" },
        { key: "classified", label: "Classified", hex: "d32ce6" },
        { key: "covert", label: "Covert", hex: "eb4b4b" },
        { key: "contraband", label: "Contraband", hex: "e4ae39" },
    ],
    Dota2: [
        { key: "common", label: "Common", hex: "b0c3d9" },
        { key: "uncommon", label: "Uncommon", hex: "5e98d9" },
        { key: "rare", label: "Rare", hex: "4b69ff" },
        { key: "mythical", label: "Mythical", hex: "8847ff" },
        { key: "legendary", label: "Legendary", hex: "d32ce6" },
        { key: "ancient", label: "Ancient", hex: "eb4b4b" },
        { key: "immortal", label: "Immortal", hex: "e4ae39" },
        { key: "arcana", label: "Arcana", hex: "ade55c" },
    ],
}
