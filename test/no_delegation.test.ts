import { EntryPoint__factory } from "@account-abstraction/contracts"
import { Wallet, ethers } from "ethers"
import hre from "hardhat"
import { Delegatable4337Account__factory } from "../typechain-types"
import { callData, fillUserOp, getUserOpHash } from "../scripts/runOp"
import { expect } from "chai"
import { arrayify } from "@ethersproject/bytes"
import { sign } from "crypto"
import { ecsign } from "ethereumjs-util"

describe("no delegation", function () {
    it("should succeed if signed correctly", async function () {
        const signer = hre.ethers.provider.getSigner()
        console.log("signer", await signer.getAddress())
        const entryPoint = await new EntryPoint__factory(signer).deploy()

        // with one account as owner
        const delegatable4337Account = await new Delegatable4337Account__factory(signer).deploy(entryPoint.address, [await signer.getAddress()], 1)

        await signer.sendTransaction({
            to: delegatable4337Account.address,
            value: ethers.utils.parseEther("1"),
        })

        const userOp = await fillUserOp(hre, {
            sender: delegatable4337Account.address,
            initCode: "0x",
            callData: await callData(hre, delegatable4337Account.address, "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", 1, "0x"), // send 1 wei to vitalik
          });

        const hash = await entryPoint.getUserOpHash(userOp)
        console.log("hash", hash)

        ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(privateKey)))

        const signature = await signer.signMessage(arrayify(hash))
        // ecrover the signature using the hash

        const recovered = await signer.getAddress()

        userOp.signature = signature

        console.log(signature.length)

        // convert bytes to string
        const string = ethers.utils.toUtf8String("0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000164141323320726576657274656420286f72204f4f472900000000000000000000")
        console.log(string)

        const tx = await entryPoint.handleOps([userOp], await signer.getAddress(), { gasLimit: 10000000 })
        await tx.wait()

        expect(hre.ethers.provider.getBalance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).to.equal(1)
    })
})