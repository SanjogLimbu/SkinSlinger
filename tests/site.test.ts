import { describe, it, expect, vi, afterEach } from "vitest"
import { toSlug, getBaseUrl } from "@/app/lib/site"

//

describe("toSlug", () => {

    it("Turns an item name into a lowercase URL slug.", () => {
        expect(toSlug("AK-47 | Redline (Field-Tested)")).toBe("ak-47-redline-field-tested")
    })


    it("Drops a leading symbol such as the knife star.", () => {
        expect(toSlug("★ Karambit | Fade")).toBe("karambit-fade")
    })

})

//

describe("getBaseUrl", () => {

    afterEach(() => vi.unstubAllEnvs())

    it("Removes a trailing slash from NEXTAUTH_URL.", () => {
        vi.stubEnv("NEXTAUTH_URL", "https://skinslinger.com/")

        expect(getBaseUrl()).toBe("https://skinslinger.com")
    })


    it("Falls back to localhost when NEXTAUTH_URL is not set.", () => {
        vi.stubEnv("NEXTAUTH_URL", undefined)

        expect(getBaseUrl()).toBe("http://localhost:3000")
    })


})
