import { ethers } from "hardhat"
import { EntryPoint, EntryPoint__factory } from "@account-abstraction/contracts"
import { Contract, ContractFactory, utils, Wallet } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { DelegationStruct, SignedDelegationStruct, MultisigParamsStruct } from "../typechain-types/contracts/SimpleMultisig"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { arrayify, defaultAbiCoder, hexConcat, hexlify, keccak256 } from "ethers/lib/utils"
import hre from "hardhat"
import { getPrivateKeys } from "../scripts/utils/getPrivateKeys"
import { Delegatable4337Account, Delegatable4337Account__factory } from "../typechain-types"
import { Provider } from "@ethersproject/providers"
import { callData, UserOpStruct } from "../scripts/runOp"
import { expect } from "chai"
// @ts-ignore
import { createSigningUtil } from "../scripts/signTypedData"
import { ecsign } from "ethereumjs-util"
const types = require("../scripts/types.js")
const { getSigners } = ethers

function signatureToHexString(signature: any) {
    const rHex = signature.r.toString("hex")
    const sHex = signature.s.toString("hex")
    const vHex = signature.v.toString(16).padStart(2, "0") // Convert bigint to hexadecimal and pad with leading zero if necessary
    return rHex + sHex + vHex
}

describe("multisig", function () {
    const CONTACT_NAME = "Smart Account"
    const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    let eip712domain: any
    let delegatableUtils: any
    let signer0: SignerWithAddress
    let signer1: SignerWithAddress
    let wallet0: Wallet
    let wallet1: Wallet
    let wallet2: Wallet
    let wallet3: Wallet
    let wallet4: Wallet
    let wallet5: Wallet
    let pk0: string
    let pk1: string
    let pk2: string
    let pk3: string
    let pk4: string
    let pk5: string
    let entryPoint: EntryPoint
  
    let AllowedMethodsEnforcer: Contract
    let AllowedMethodsEnforcerFactory: ContractFactory
    let SmartAccount: Contract
    let SmartAccount2: Contract
    let SmartAccountFactory: ContractFactory
    let Purpose: Contract
    let PurposeFactory: ContractFactory

    let delegationSignaturePayloadTypes: utils.ParamType[] | undefined
    let signaturePayloadTypes: utils.ParamType[] | undefined

    before(async () => {
        [signer0, signer1] = await getSigners();
      
        // These ones have private keys, so can be used for delegation signing:
        [wallet0, wallet1, wallet2, wallet3, wallet4, wallet5] = getPrivateKeys(
          signer0.provider as unknown as Provider
        )
        SmartAccountFactory = await ethers.getContractFactory("Delegatable4337Account")
        PurposeFactory = await ethers.getContractFactory("Purpose")
        // AllowedMethodsEnforcerFactory = await ethers.getContractFactory(
        //   "AllowedMethodsEnforcer"
        // );
        pk0 = wallet0._signingKey().privateKey
        pk1 = wallet1._signingKey().privateKey
        entryPoint = await new EntryPoint__factory(signer0).deploy()
    })
    
    beforeEach(async () => {
        Purpose = await PurposeFactory.connect(wallet0).deploy()
        SmartAccount = await SmartAccountFactory.connect(wallet0).deploy(
            entryPoint.address,
            [
                await wallet0.getAddress(),
                await wallet1.getAddress(),
                await wallet2.getAddress(),
            ], // signers
            2, // threshold
        )
        SmartAccount2 = await SmartAccountFactory.connect(wallet0).deploy(
            entryPoint.address,
            [
                await wallet3.getAddress(),
                await wallet4.getAddress(),
                await wallet5.getAddress(),
            ], // signers
            2, // threshold
        )
        // AllowedMethodsEnforcer = await AllowedMethodsEnforcerFactory.connect(
        //   wallet0
        // ).deploy();
    
        eip712domain = {
            chainId: SmartAccount.deployTransaction.chainId,
            verifyingContract: SmartAccount.address,
            name: CONTACT_NAME,
        }

        delegatableUtils = createSigningUtil(eip712domain, types)
    })

    it("should succeed if signed correctly", async function () {
        const initialBalance = await hre.ethers.provider.getBalance(recipient)

        await signer0.sendTransaction({
            to: SmartAccount.address,
            value: ethers.utils.parseEther("1"),
        })

        const userOp = await fillUserOp(hre, {
            sender: SmartAccount.address,
            initCode: "0x",
            callData: await callData(hre, SmartAccount.address, recipient, 1, "0x"), // send 1 wei to vitalik
        }, SmartAccount as Delegatable4337Account)

        const hash = await entryPoint.getUserOpHash(userOp)

        const sign = ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk0)))
        const sign2 = ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk1)))

        const signaturePayload = {
            signatures: [
                {
                    contractAddress: ethers.constants.AddressZero,
                    signature: "0x" + signatureToHexString(sign),
                },
                {
                    contractAddress: ethers.constants.AddressZero,
                    signature: "0x" + signatureToHexString(sign2),
                }
            ],
            delegations: [],
        }

        const signaturePayloadTypes = SmartAccount.interface.getFunction("decodeSignature").outputs
        if (!signaturePayloadTypes) throw new Error("No signature types found")

        const encodedSignaturePayload = ethers.utils.defaultAbiCoder.encode(
            signaturePayloadTypes,
            [signaturePayload]
        )

        userOp.signature = encodedSignaturePayload

        // convert bytes to string
        const string = ethers.utils.toUtf8String("0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000164141323320726576657274656420286f72204f4f472900000000000000000000")

        try {
            const tx = await entryPoint.handleOps([userOp], await signer0.getAddress(), { gasLimit: 10000000 })
            await tx.wait()
        } catch (err) {

        }

        expect((await hre.ethers.provider.getBalance(recipient)).toBigInt()).to.equal(initialBalance.toBigInt() + 1n)
    })

    it("should update the signer address and validate the change", async function () {
        const newSigner = await ethers.Wallet.createRandom()
    
        // Check initial signer status
        expect(await SmartAccount.isOwner(wallet0.address)).to.be.true
        expect(await SmartAccount.isOwner(newSigner.address)).to.be.false
    
        // Update signer address
        await SmartAccount.connect(wallet0).updateSignerAddress(wallet0.address, newSigner.address)
    
        // Validate that the signer address was updated
        expect(await SmartAccount.isOwner(wallet0.address)).to.be.false
        expect(await SmartAccount.isOwner(newSigner.address)).to.be.true
    
        // Check that the owners array was updated
        console.log("Requesting owners...")
        const updatedOwners = await SmartAccount.getOwners()
        console.log("updatedOwners", updatedOwners)
        expect(updatedOwners.includes(wallet0.address)).to.be.false
        expect(updatedOwners.includes(newSigner.address)).to.be.true
    })


    it("should fail if signed by the wrong address", async function () {
        const initialBalance = await hre.ethers.provider.getBalance(recipient)

        await signer0.sendTransaction({
            to: SmartAccount.address,
            value: ethers.utils.parseEther("1"),
        })

        const userOp = await fillUserOp(hre, {
            sender: SmartAccount.address,
            initCode: "0x",
            callData: await callData(hre, SmartAccount.address, recipient, 1, "0x"), // send 1 wei to vitalik
        }, SmartAccount as Delegatable4337Account)

        const hash = await entryPoint.getUserOpHash(userOp)
        const sign = ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk1)))

        const signaturePayload = {
            signatures: [
                {
                    contractAddress: ethers.constants.AddressZero,
                    signature: "0x" + signatureToHexString(sign),
                },
            ],
            delegations: [],
        }

        const signaturePayloadTypes = SmartAccount.interface.getFunction("decodeSignature").outputs
        if (!signaturePayloadTypes) throw new Error("No signature types found")

        const encodedSignaturePayload = ethers.utils.defaultAbiCoder.encode(
            signaturePayloadTypes,
            [signaturePayload]
        )

        userOp.signature = encodedSignaturePayload

        // convert bytes to string
        const string = ethers.utils.toUtf8String("0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000164141323320726576657274656420286f72204f4f472900000000000000000000")

        try {
            const tx = await entryPoint.handleOps([userOp], await signer0.getAddress(), { gasLimit: 10000000 })
            await tx.wait()
        } catch (err) {
            expect(err).to.not.be.undefined
        }

        expect((await hre.ethers.provider.getBalance(recipient)).toBigInt()).to.equal(initialBalance.toBigInt())
    })

    it("should correctly update the signer list", async function () {
        const initialBalance = await hre.ethers.provider.getBalance(recipient)
    
        // Fund SmartAccount initially:
        await signer0.sendTransaction({
            to: SmartAccount.address,
            value: ethers.utils.parseEther("1"),
        })
    
        console.log("prepare new stuff")
        // Encode the new signer list and threshold
        let multisigParams: MultisigParamsStruct = {
            signers: [wallet3.address, wallet4.address, wallet5.address],
            threshold: 2, 
        }

        // Sign the new signer list and threshold
        let updateSignature = delegatableUtils.multiSignTypedDataLocal(
            [pk0, pk1],
            "MultisigParams",
            multisigParams,
            SmartAccount.address
        )

        // Prepare UserOperation for updating signer list
        console.log("prepare user op")
        const userOp = await createSignedUserOp({
            sender: SmartAccount.addres,
            initCode: "0x",
            callData: SmartAccount.interface.encodeFunctionData("updateSigners", [updateSignature]),
        }, [], [pk0, pk1], SmartAccount.address)
        console.log("prepared user op")
    
        // Update the signer list
        const tx = await entryPoint.handleOps([userOp], await signer0.getAddress(), { gasLimit: 30000000 })
        console.log("handled ops")
        await tx.wait()
        console.log("tx mined")
    
        // Validate the new signer list and threshold
        const updatedOwners = await SmartAccount.getOwners()
        expect(updatedOwners).to.include.members(newSigners)
        expect(await SmartAccount.threshold()).to.equal(newThreshold)
    })

    async function createSignedUserOp (
        _userOp: Partial<UserOpStruct>, 
        delegations: SignedDelegationStruct[], 
        privateKeys: string[],
        senderAddress: string)
          : Promise<UserOpStruct>
    {
        const userOp = await fillUserOp(hre, _userOp, SmartAccount as Delegatable4337Account)
        const hash = await entryPoint.getUserOpHash(userOp)

        const sigs = privateKeys.map(pk => ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk))))
        const signatures = sigs.map((sign, i) => {
            return {
                contractAddress: ethers.constants.AddressZero,
                signature: "0x" + signatureToHexString(sign),
            }
        })

        const signaturePayload = {
            signatures,
            delegations,
        }

        if (!signaturePayloadTypes) throw new Error("No signature types found")

        const encodedSignaturePayload = ethers.utils.defaultAbiCoder.encode(
            signaturePayloadTypes,
            [signaturePayload]
        )

        userOp.signature = encodedSignaturePayload
        return userOp
    }
})

async function fillUserOp(hre: HardhatRuntimeEnvironment, userOp:Partial<UserOpStruct>, sender: Delegatable4337Account) : Promise<UserOpStruct> {
    if(await hre.ethers.provider.getCode(userOp.sender!) == "0x") {
        userOp.nonce = hexlify(0)
    } else {
        userOp.nonce = hexlify((await sender.getNonce()).toNumber())
    }
    userOp.callGasLimit = hexlify(300000)
    userOp.verificationGasLimit = hexlify(3000000)
    userOp.preVerificationGas = hexlify(3000000)

    const gasPrice = (await hre.ethers.provider.getGasPrice()).mul(2)

    userOp.maxFeePerGas = hexlify(gasPrice)
    userOp.maxPriorityFeePerGas = hexlify(gasPrice)
    userOp.paymasterAndData = hexlify("0x")
    userOp.signature = hexlify("0x")
    return userOp as UserOpStruct
}
