export default function InventoryLoading() {
    return (
        <>
            {/* Desktop game filter sidebar */}
            <div className="hidden md:flex flex-col fixed left-[2.5%] top-20 w-43">
                <div className="bg-secondary rounded-sm px-3 py-3 animate-pulse">
                    <div className="h-3 w-12 bg-accent rounded mb-3" />
                    <div className="flex flex-col gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-9 bg-accent rounded-sm" />
                        ))}
                    </div>
                </div>
            </div>

            {/* Desktop layout */}
            <div className="hidden md:flex h-full w-full justify-center items-center">
                <div className="w-200 h-150 flex justify-center items-center">
                    <div>
                        {/* Info bar */}
                        <div className="bg-secondary w-310 h-18 mt-13 absolute flex items-center px-6 rounded-sm animate-pulse gap-10">
                            <div className="flex flex-col items-center gap-1">
                                <div className="h-2.5 w-10 bg-accent rounded" />
                                <div className="h-6 w-12 bg-accent rounded" />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="h-2.5 w-20 bg-accent rounded" />
                                <div className="h-6 w-16 bg-accent rounded" />
                            </div>
                            <div className="flex flex-col items-center gap-1 ml-auto">
                                <div className="h-2.5 w-20 bg-accent rounded" />
                                <div className="h-6 w-14 bg-accent rounded" />
                            </div>
                        </div>

                        {/* Grid */}
                        <div className="bg-secondary w-310 mr-30 h-190 mt-34 grid grid-cols-6 gap-2 p-3 rounded-sm animate-pulse content-start">
                            {Array.from({ length: 24 }).map((_, i) => (
                                <div key={i} className="h-36 bg-accent rounded-sm" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile layout */}
            <div className="md:hidden flex flex-col h-full pt-[72px]">
                {/* Game filter bar */}
                <div className="flex px-3 py-2 gap-1.5 bg-secondary border-b border-gray-700/50 animate-pulse">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="shrink-0 w-14 h-8 bg-accent rounded-sm" />
                    ))}
                </div>

                {/* Info bar */}
                <div className="bg-secondary flex items-center px-4 py-3 rounded-sm shrink-0 gap-6 animate-pulse">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className={`flex flex-col items-center gap-1 ${i === 2 ? 'ml-auto' : ''}`}>
                            <div className="h-2.5 w-14 bg-accent rounded" />
                            <div className="h-6 w-10 bg-accent rounded" />
                        </div>
                    ))}
                </div>

                {/* Grid */}
                <div className="overflow-y-auto flex-1 bg-secondary mt-2 p-3 rounded-sm animate-pulse">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="h-36 bg-accent rounded-sm" />
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}
