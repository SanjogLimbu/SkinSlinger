import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { processWithdrawal } from "@/lib/crypto/withdrawals"

//

const writeContract = vi.hoisted(() => vi.fn())

vi.mock("viem", async importOriginal => {
    const viem = await importOriginal<typeof import("viem")>()

    return { ...viem, createWalletClient: () => ({ writeContract }) }
})

vi.mock("viem/accounts", () => ({ privateKeyToAccount: () => ({}) }))

//

const WALLET = `0x${"a".repeat(40)}`
const PROFIT_WALLET = `0x${"b".repeat(40)}`
const USDC = `0x${"c".repeat(40)}`

const deductBalance = vi.fn()
const refundBalance = vi.fn()

beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("USDC_ADDRESS", USDC)
    vi.stubEnv("USDC_PROFIT_ADDRESS", PROFIT_WALLET)

    deductBalance.mockResolvedValue(true)
    writeContract.mockResolvedValue("0xhash")
})

afterEach(() => vi.unstubAllEnvs())

//

function withdraw(amount: number, address = WALLET, feeRate = 0.025) {
    return processWithdrawal(amount, address, feeRate, deductBalance, refundBalance)
}

//

describe("processWithdrawal", () => {

    it.each([0, 0.5, NaN])("Rejects a withdrawal of %d before touching the balance.", async (amount) => {
        await expect(withdraw(amount)).rejects.toThrow("Minimum withdrawal is $1.00")
        expect(deductBalance).not.toHaveBeenCalled()
    })


    it("Rejects a blank wallet address.", async () => {
        await expect(withdraw(10, "  ")).rejects.toThrow("Wallet address required")
        expect(deductBalance).not.toHaveBeenCalled()
    })


    it("Sends nothing when the balance is too low.", async () => {
        deductBalance.mockResolvedValue(false)

        await expect(withdraw(10)).rejects.toThrow("Insufficient balance")
        expect(writeContract).not.toHaveBeenCalled()
    })


    it("Sends the amount minus the fee to the user, and the fee to the profit wallet.", async () => {
        expect(await withdraw(100)).toEqual({ transactionHash: "0xhash", usdcAmount: 97.5 })

        // USDC has 6 decimals, so $97.50 is 97,500,000 units.
        expect(writeContract).toHaveBeenNthCalledWith(1, expect.objectContaining({
            address: USDC,
            functionName: "transfer",
            args: [WALLET, 97_500_000n],
        }))
        expect(writeContract).toHaveBeenNthCalledWith(2, expect.objectContaining({
            address: USDC,
            functionName: "transfer",
            args: [PROFIT_WALLET, 2_500_000n],
        }))
    })


    it("Refunds the balance if the transfer fails.", async () => {
        writeContract.mockRejectedValue(new Error("RPC down"))

        await expect(withdraw(100)).rejects.toThrow("RPC down")
        expect(refundBalance).toHaveBeenCalledTimes(1)
    })


    it("A failed fee transfer doesn't fail or refund the withdrawal.", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        writeContract.mockResolvedValueOnce("0xhash").mockRejectedValueOnce(new Error("RPC down"))

        expect(await withdraw(100)).toEqual({ transactionHash: "0xhash", usdcAmount: 97.5 })
        expect(refundBalance).not.toHaveBeenCalled()
    })

})
