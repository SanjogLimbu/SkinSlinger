import * as React from 'react'

//

interface Props {
    sellerName: string
    items: { marketName: string; price: number }[]
}

//

export function TradeOfferSentEmail({ sellerName, items }: Props) {
    const total = items.reduce((sum, item) => sum + item.price, 0)
    const many = items.length > 1

    return (
        <div style={{ backgroundColor: '#1f1f1f', padding: '40px 0', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ maxWidth: '480px', margin: '0 auto', backgroundColor: '#2c2c2c', borderRadius: '6px', overflow: 'hidden' }}>

                <div style={{ backgroundColor: '#363636', padding: '24px 32px' }}>
                    <h1 style={{ margin: 0, color: '#3d9cbe', fontSize: '22px', fontWeight: 'bold' }}>
                        SkinSlinger
                    </h1>
                </div>

                <div style={{ padding: '36px 32px' }}>
                    <h2 style={{ margin: '0 0 12px', color: '#ffffff', fontSize: '20px', fontWeight: 'bold' }}>
                        Action needed: accept your trade offer
                    </h2>

                    <p style={{ margin: '0 0 24px', color: '#aaaaaa', fontSize: '15px', lineHeight: '1.6' }}>
                        <strong style={{ color: '#ffffff' }}>{sellerName}</strong> says they&apos;ve sent a Steam
                        trade offer for the following item{many ? 's' : ''}. Check your Steam trade offers and
                        accept it to receive {many ? 'them' : 'it'}.
                    </p>

                    {items.map((item, i) => (
                        <div
                            key={i}
                            style={{ backgroundColor: '#363636', borderRadius: '4px', padding: '12px 16px', marginBottom: '8px' }}
                        >
                            <p style={{ margin: '0 0 4px', color: '#ffffff', fontSize: '14px' }}>
                                {item.marketName}
                            </p>

                            <p style={{ margin: 0, color: '#0088be', fontSize: '14px', fontWeight: 'bold' }}>
                                ${item.price.toFixed(2)}
                            </p>
                        </div>
                    ))}

                    <div style={{ padding: '12px 0', borderTop: '1px solid #444' }}>
                        <span style={{ color: '#aaaaaa', fontSize: '14px' }}>Total: </span>

                        <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 'bold' }}>
                            ${total.toFixed(2)}
                        </span>
                    </div>

                    <div style={{ backgroundColor: '#1a3a4a', borderRadius: '4px', padding: '16px', margin: '24px 0' }}>
                        <a
                            href="https://skinslinger.com/orders"
                            style={{ color: '#0088be', fontSize: '13px' }}
                        >
                            View your orders →
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
