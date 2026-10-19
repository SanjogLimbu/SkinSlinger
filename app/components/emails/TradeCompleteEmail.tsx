import * as React from 'react'

//

interface Props {
    role: 'buyer' | 'seller'
    items: { marketName: string; price: number }[]
}

//

export function TradeCompleteEmail({ role, items }: Props) {
    const total = items.reduce((sum, item) => sum + item.price, 0)
    const many = items.length > 1

    const heading = role === 'buyer'
        ? `Item${many ? 's' : ''} received`
        : 'Funds released to your balance'

    const body = role === 'buyer'
        ? `We've confirmed the following item${many ? 's' : ''} arrived in your Steam inventory. The trade is complete.`
        : `Your sale${many ? 's are' : ' is'} complete — the held balance below is now available in your SkinSlinger account.`

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
                        {heading}
                    </h2>

                    <p style={{ margin: '0 0 24px', color: '#aaaaaa', fontSize: '15px', lineHeight: '1.6' }}>
                        {body}
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
                        <span style={{ color: '#aaaaaa', fontSize: '14px' }}>
                            {role === 'seller' ? 'Released: ' : 'Total: '}
                        </span>

                        <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 'bold' }}>
                            ${total.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
