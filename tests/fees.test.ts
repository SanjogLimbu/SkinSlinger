import { describe, it, expect, vi, beforeEach } from "vitest"
import { getWithdrawalFee } from "@/lib/fees"

//

const prisma = vi.hoisted(() => ({ purchase: { aggregate: vi.fn() } }))

vi.mock("@/lib/db", () => ({ prisma }))

beforeEach(() => vi.resetAllMocks())

//

function tradeVolume(volume: number | null) {
    prisma.purchase.aggregate.mockResolvedValue({ _sum: { price: volume } })
}

//

describe("getWithdrawalFee", () => {

    it("A signed-out user sees the starting rate, without a database lookup.", async () => {
        expect(await getWithdrawalFee()).toEqual({ rate: 0.025, volume: 0, next: { minVolume: 100, rate: 0.02 } })
        expect(prisma.purchase.aggregate).not.toHaveBeenCalled()
    })


    it("A user with no completed trades pays the starting rate.", async () => {
        tradeVolume(null)

        expect(await getWithdrawalFee("user")).toMatchObject({ rate: 0.025, volume: 0 })
    })


    it.each([
        [99.99, 0.025],
        [100, 0.02],
        [999.99, 0.02],
        [1000, 0.015],
        [5000, 0.01],
        [24999.99, 0.01],
        [25000, 0.005],
    ])("$%d of trades pays a %d rate.", async (volume, rate) => {
        tradeVolume(volume)

        expect((await getWithdrawalFee("user")).rate).toBe(rate)
    })


    it("Shows the next tier to reach.", async () => {
        tradeVolume(150)

        expect((await getWithdrawalFee("user")).next).toEqual({ minVolume: 1000, rate: 0.015 })
    })


    it("The top tier has no next tier.", async () => {
        tradeVolume(30000)

        expect((await getWithdrawalFee("user")).next).toBeNull()
    })


    it("Only completed trades count, as buyer or seller.", async () => {
        tradeVolume(0)

        await getWithdrawalFee("user")

        expect(prisma.purchase.aggregate).toHaveBeenCalledWith({
            where: { status: "completed", OR: [{ buyerId: "user" }, { sellerId: "user" }] },
            _sum: { price: true },
        })
    })

})
