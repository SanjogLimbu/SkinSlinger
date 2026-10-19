import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createDeposit, getDepositStatus, processDeposits } from "@/lib/crypto/deposits"
import { getDepositAddress, getPublicClient } from "@/lib/crypto/account"
import { sweepUSDC } from "@/lib/crypto/sweep"

//

const { prisma, client } = vi.hoisted(() => ({
    prisma: {
        deposit_counter: { upsert: vi.fn(), update: vi.fn() },
        crypto_deposit: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    },
    client: { getBlockNumber: vi.fn(), multicall: vi.fn(), getTransactionReceipt: vi.fn(), readContract: vi.fn(), getLogs: vi.fn() },
}))

vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/crypto/account", () => ({ getDepositAddress: vi.fn(), getPublicClient: vi.fn() }))
vi.mock("@/lib/crypto/sweep", () => ({ sweepUSDC: vi.fn() }))

//

type Deposit = { id: string, userId: string, address: string, index: number, amountUsdc: number, status: string, txHash: string | null, expiresAt: Date }
type StatusFilter = string | { in: string[] }

const MINUTE = 60 * 1000

// An in-memory crypto_deposit table, so a status written by one query is seen by the next
let deposits: Deposit[] = []

beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})

    deposits = []
    prisma.crypto_deposit.findMany.mockImplementation(async ({ where }: { where: { status: StatusFilter } }) =>
        deposits.filter(d => typeof where.status === "string" ? d.status === where.status : where.status.in.includes(d.status))
    )
    prisma.crypto_deposit.findUnique.mockImplementation(async ({ where }: { where: { address: string } }) =>
        deposits.find(d => d.address === where.address) ?? null
    )
    prisma.crypto_deposit.update.mockImplementation(async ({ where, data }: { where: { id?: string, address?: string }, data: Partial<Deposit> }) =>
        Object.assign(deposits.find(d => d.id === where.id || d.address === where.address)!, data)
    )
    prisma.deposit_counter.upsert.mockResolvedValue({ value: 1, lastBlock: 900n })

    vi.mocked(getPublicClient).mockReturnValue(client as never)
    client.getBlockNumber.mockResolvedValue(1000n)
    client.getLogs.mockResolvedValue([])
    vi.mocked(sweepUSDC).mockResolvedValue("0xsweep")
})

afterEach(() => vi.useRealTimers())

//

function deposit(overrides: Partial<Deposit> = {}): Deposit {
    return { id: "d1", userId: "user", address: "0xDeposit", index: 7, amountUsdc: 50, status: "pending", txHash: null, expiresAt: new Date(Date.now() + 10 * MINUTE), ...overrides }
}


// A USDC transfer to the deposit address; 1 USDC is 1,000,000 units
function transfer(value: bigint) {
    return { args: { to: "0xdeposit", value }, transactionHash: "0xtransfer" }
}

//

describe("createDeposit", () => {

    it.each([0, 0.99])("Rejects a deposit of $%d.", async (amount) => {
        await expect(createDeposit("user", amount)).rejects.toThrow("Minimum deposit is $1.00")
        expect(prisma.deposit_counter.upsert).not.toHaveBeenCalled()
    })


    it("Each deposit gets its own address, and expires after 30 minutes.", async () => {
        vi.useFakeTimers({ now: new Date("2026-10-16T12:00:00Z") })
        prisma.deposit_counter.upsert.mockResolvedValue({ value: 42 })
        vi.mocked(getDepositAddress).mockReturnValue("0xdeposit42")

        const expiresAt = new Date("2026-10-16T12:30:00Z")

        expect(await createDeposit("user", 25)).toEqual({ address: "0xdeposit42", amount: 25, expiresAt })
        expect(getDepositAddress).toHaveBeenCalledWith(42)
        expect(prisma.crypto_deposit.create).toHaveBeenCalledWith({ data: { userId: "user", address: "0xdeposit42", index: 42, amountUsdc: 25, expiresAt } })
    })

})

//

describe("getDepositStatus", () => {

    it("Hides deposits that don't exist or belong to someone else.", async () => {
        expect(await getDepositStatus("0xDeposit", "user")).toBeNull()

        deposits = [deposit({ userId: "someone-else" })]

        expect(await getDepositStatus("0xDeposit", "user")).toBeNull()
    })


    it("A pending deposit past its expiry is marked expired.", async () => {
        deposits = [deposit({ expiresAt: new Date(Date.now() - MINUTE) })]

        expect(await getDepositStatus("0xDeposit", "user")).toBe("expired")
        expect(deposits[0].status).toBe("expired")
    })


    it.each([["pending", "waiting"], ["confirmed", "confirming"], ["swept", "finished"]])("A %s deposit is shown as %s.", async (status, shown) => {
        deposits = [deposit({ status })]

        expect(await getDepositStatus("0xDeposit", "user")).toBe(shown)
    })

})

//

describe("processDeposits", () => {

    it("Credits the amount that actually arrived, not the amount asked for.", async () => {
        const onCredit = vi.fn()
        deposits = [deposit({ amountUsdc: 50 })]
        client.getLogs.mockResolvedValue([transfer(20_000_000n)])

        expect(await processDeposits(onCredit)).toEqual({ processed: 1 })
        expect(sweepUSDC).toHaveBeenCalledWith(7, 20_000_000n)
        expect(onCredit).toHaveBeenCalledWith("user", 20)
        expect(deposits[0]).toMatchObject({ status: "swept", txHash: "0xsweep" })
    })


    it("Ignores zero-value transfers (address-poisoning spam).", async () => {
        const onCredit = vi.fn()
        deposits = [deposit()]
        client.getLogs.mockResolvedValue([transfer(0n)])

        await processDeposits(onCredit)

        expect(onCredit).not.toHaveBeenCalled()
        expect(deposits[0].status).toBe("pending")
    })


    it("A failed sweep isn't credited, and stays confirmed for the next run.", async () => {
        const onCredit = vi.fn()
        deposits = [deposit()]
        client.getLogs.mockResolvedValue([transfer(20_000_000n)])
        vi.mocked(sweepUSDC).mockRejectedValue(new Error("out of gas"))

        expect(await processDeposits(onCredit)).toEqual({ processed: 0 })
        expect(onCredit).not.toHaveBeenCalled()
        expect(deposits[0].status).toBe("confirmed")
    })


    it("Retries a confirmed deposit that failed to sweep last time.", async () => {
        const onCredit = vi.fn()
        deposits = [deposit({ status: "confirmed" })]
        client.readContract.mockResolvedValue(5_000_000n)

        expect(await processDeposits(onCredit)).toEqual({ processed: 1 })
        expect(onCredit).toHaveBeenCalledWith("user", 5)
        expect(deposits[0].status).toBe("swept")
    })


    it("A confirmed deposit with nothing left to sweep is removed, not credited again.", async () => {
        const onCredit = vi.fn()
        deposits = [deposit({ status: "confirmed" })]
        client.readContract.mockResolvedValue(0n)

        await processDeposits(onCredit)

        expect(prisma.crypto_deposit.delete).toHaveBeenCalledWith({ where: { id: "d1" } })
        expect(onCredit).not.toHaveBeenCalled()
    })


    it("Money sent after a deposit expired is still found and credited.", async () => {
        const onCredit = vi.fn()
        deposits = [deposit({ status: "expired" })]
        client.multicall.mockResolvedValue([5_000_000n])
        client.readContract.mockResolvedValue(5_000_000n)

        await processDeposits(onCredit)

        expect(onCredit).toHaveBeenCalledWith("user", 5)
        expect(deposits[0].status).toBe("swept")
    })


    it("A swept deposit isn't credited again while its sweep is still being mined.", async () => {
        const onCredit = vi.fn()
        deposits = [deposit({ status: "swept", txHash: "0xsweep" })]
        client.multicall.mockResolvedValue([5_000_000n])
        client.getTransactionReceipt.mockRejectedValue(new Error("receipt not found"))

        await processDeposits(onCredit)

        expect(onCredit).not.toHaveBeenCalled()
        expect(deposits[0].status).toBe("swept")
    })

})
