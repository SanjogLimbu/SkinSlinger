import * as React from 'react'

//

interface Props {
    code: string
}

//

export function EmailVerificationEmail({ code }: Props) {
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
                        Confirm your email
                    </h2>

                    <p style={{ margin: '0 0 24px', color: '#aaaaaa', fontSize: '15px', lineHeight: '1.6' }}>
                        Enter this code on SkinSlinger to start receiving order notifications at this address.
                        It expires in 15 minutes.
                    </p>

                    <div style={{ backgroundColor: '#363636', borderRadius: '4px', padding: '20px', textAlign: 'center' }}>
                        <span style={{ color: '#ffffff', fontSize: '30px', fontWeight: 'bold', letterSpacing: '8px' }}>
                            {code}
                        </span>
                    </div>

                    <p style={{ margin: '24px 0 0', color: '#777777', fontSize: '13px', lineHeight: '1.6' }}>
                        If you didn&apos;t request this, you can ignore this email.
                    </p>
                </div>
            </div>
        </div>
    )
}
