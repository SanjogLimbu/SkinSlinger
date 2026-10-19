import Image from 'next/image'
import { memo } from 'react'
import { SteamItem } from '@/lib/steam'
import FloatBar from '@/app/components/FloatBar'

//

function InventoryItemCard({ item, quantity, setSelling, hexColor, loading = false }: {
    item: SteamItem,
    quantity: number,
    setSelling: React.Dispatch<React.SetStateAction<SteamItem[]>>,
    hexColor: string,
    loading?: boolean
}) {
    function add() {
        setSelling(prev => [...prev, item])
    }


    const cardStyle = {
        '--glow': `#${hexColor}44`,
        border: `1px solid #${hexColor}`,
    } as React.CSSProperties

    return (
        <div
            className="bg-accent h-60 md:h-72 w-full relative transition-all duration-200 hover:scale-[1.04] hover:-translate-y-1 hover:z-10 hover:[box-shadow:0_8px_20px_var(--glow),0_4px_10px_rgba(0,0,0,0.5)]"
            style={cardStyle}
        >
            <div
                className="absolute top-0 left-0 right-0 h-10 pointer-events-none z-1"
                style={{ background: `linear-gradient(to bottom, #${hexColor}88, transparent)` }}
            />

            <div className="flex justify-between mt-2 pl-2 pr-2 w-full absolute z-2">
                <h1 className="text-[10px] md:text-[14px] w-35 font-medium">
                    {item.market_name}
                </h1>

                {!item.floatValue && (
                    <h1 className="text-[10px] md:text-[14px]">
                        [x{quantity}]
                    </h1>
                )}
            </div>

            <div className="absolute inset-0 flex justify-center items-center z-0 mb-16">
                <Image
                    src={item.icon}
                    alt="Failed To Load"
                    style={{ width: 'auto', height: 'auto', maxHeight: '100px' }}
                    width={100}
                    height={100}
                />
            </div>

            <div className="absolute bottom-10 left-0 right-0 px-2 z-2 flex flex-col gap-1">
                {item.stickers && item.stickers.length > 0 && (
                    <div className="flex gap-1">
                        {item.stickers.slice(0, 4).map((s, i) => (
                            <Image
                                key={i}
                                src={s.image}
                                alt={s.name}
                                title={s.name}
                                width={60}
                                height={60}
                                style={{ opacity: s.wear != null ? 1 - s.wear * 0.8 : 1 }}
                                className="h-[20px] md:h-[30px] w-auto"
                            />
                        ))}
                    </div>
                )}


                {item.floatValue && (
                    <>
                        {item.paintSeed != null && (
                            <p className="text-[10px] opacity-50">
                                Pattern:{" "}

                                <span className="text-gray-200">
                                    {item.paintSeed}
                                </span>
                            </p>
                        )}

                        <p className="text-[10px] opacity-50 font-mono">
                            Wear Rating: {item.floatValue.toFixed(6)}
                        </p>

                        <FloatBar
                            value={item.floatValue}
                            showLabels={false}
                        />
                    </>
                )}
            </div>

            <div className="absolute bottom-2 right-2 z-2 flex items-center gap-2">
                <p className="text-[15px]">
                    {loading ? '...' : `$${item.price.toFixed(2)}`}
                </p>

                <button
                    onClick={add}
                    disabled={loading}
                    className="bg-secondary button rounded-sm px-3 h-7 text-xs"
                >
                    SELL
                </button>
            </div>
        </div>
    )
}


// The parent rebuilds items every render, so only the fields shown are compared.
export default memo(InventoryItemCard, (prev, next) =>
    prev.item.assetId === next.item.assetId &&
    prev.item.price === next.item.price &&
    prev.quantity === next.quantity &&
    prev.hexColor === next.hexColor &&
    prev.loading === next.loading
)
