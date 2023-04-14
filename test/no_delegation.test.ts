import { EntryPoint__factory } from "@account-abstraction/contracts"
import { ethers } from "ethers"
import hre from "hardhat"
import { Delegatable4337Account__factory } from "../typechain-types"
import { callData, fillUserOp } from "../scripts/runOp"
import { expect } from "chai"

describe("no delegation", function () {
    it("should succeed if signed correctly", async function () {
        const signer = hre.ethers.provider.getSigner()
        const entryPoint = await new EntryPoint__factory(signer).deploy()

        // with one account as owner
        const delegatable4337Account = await new Delegatable4337Account__factory(signer).deploy(entryPoint.address, [await signer.getAddress()], 1)

        signer.sendTransaction({
            to: delegatable4337Account.address,
            value: ethers.utils.parseEther("1"),
        })

        const userOp = await fillUserOp(hre, {
            sender: delegatable4337Account.address,
            callData: await callData(hre, delegatable4337Account.address, "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", 1, "0x"), // send 1 wei to vitalik
          });

        const signature = await signer.signMessage(ethers.utils.arrayify(await entryPoint.getUserOpHash(userOp)))

        userOp.signature = signature

        const tx = await entryPoint.handleOps([userOp], await signer.getAddress())
        await tx.wait()

        expect(hre.ethers.provider.getBalance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).to.equal(1)
    })
})