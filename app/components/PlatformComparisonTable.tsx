const platformComparisons = [
    { name: 'SkinSlinger', sales: '0%',  deposit: '0%',   withdrawal: '2.5%',   total: '2.5%',   highlight: true },
    { name: 'CSFloat',     sales: '2%',  deposit: '2.8%', withdrawal: '0.5%', total: '5.3%' },
    { name: 'CS.Money',    sales: '7%',  deposit: '0%',   withdrawal: '0%',   total: '7%' },
    { name: 'Skinport',    sales: '8%',  deposit: '0%',   withdrawal: '0%',   total: '8%' },
    { name: 'DMarket',     sales: '7%',  deposit: '0%',   withdrawal: '2.5%', total: '9.5%' },
    { name: 'Steam Market',sales: '15%', deposit: '0%',   withdrawal: 'N/A',  total: '15%+' },
]

//

export default function PlatformComparisonTable() {
    return (
        <div className="w-full max-w-2xl">
            <div className="bg-secondary rounded-sm text-xs w-full">
                <div className="grid grid-cols-5 px-3 py-2 border-b border-gray-700 text-[10px] text-gray-500 uppercase tracking-widest">
                    <span>Platform</span>

                    <span className="text-center">Sales</span>

                    <span className="text-center">
                        <span className="hidden sm:inline">Deposit</span>

                        <span className="sm:hidden">Dep.</span>
                    </span>

                    <span className="text-center">
                        <span className="hidden sm:inline">Withdrawal</span>

                        <span className="sm:hidden">W/D</span>
                    </span>

                    <span className="text-right">Total</span>
                </div>

                {platformComparisons.map(({ name, sales, deposit, withdrawal, total, highlight }, i, arr) => {
                    const feeColor = highlight ? 'text-special' : 'text-gray-300'
                    const totalColor = !highlight && total.includes('15') ? 'text-red-400' : feeColor

                    return (
                        <div
                            key={name}
                            className={`grid grid-cols-5 px-3 py-2.5 items-center ${i < arr.length - 1 ? 'border-b border-gray-700' : ''} ${highlight ? 'bg-special/10' : ''}`}
                        >
                            <span className={`text-[11px] ${highlight ? 'text-special font-semibold' : 'text-gray-300'}`}>
                                {name}
                            </span>

                            <span className={`text-center font-medium ${feeColor}`}>
                                {sales}
                            </span>

                            <span className={`text-center font-medium ${feeColor}`}>
                                {deposit}
                            </span>

                            <span className={`text-center font-medium ${feeColor}`}>
                                {withdrawal}
                            </span>

                            <span className={`text-right font-semibold ${totalColor}`}>
                                {total}
                            </span>
                        </div>
                    )
                })}
            </div>

            <p className="text-xs text-gray-500 text-center mt-2">
                Fees have been taken from pricempire.com
            </p>
        </div>
    )
}
