import { ethers } from "hardhat"
import { EntryPoint, EntryPoint__factory } from "@account-abstraction/contracts"
import { Contract, ContractFactory, utils, Wallet } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { arrayify, defaultAbiCoder, hexConcat, hexlify, keccak256 } from "ethers/lib/utils"
import hre from "hardhat"
import { getPrivateKeys } from "../../scripts/utils/getPrivateKeys"
import { Delegatable4337Account, Delegatable4337Account__factory } from "../../typechain-types"
import { Provider } from "@ethersproject/providers"
import { callData, UserOpStruct } from "../../scripts/runOp"
import { expect } from "chai"   
// @ts-ignore
import { createSigningUtil } from "../../scripts/signTypedData"
import { ecsign } from "ethereumjs-util"
import { DelegationStruct, SignedDelegationStruct } from "../../typechain-types/contracts/SimpleMultisig"
const types = require("../../scripts/types.js")
const { getSigners } = ethers

function signatureToHexString(signature: any) {
    const rHex = signature.r.toString("hex")
    const sHex = signature.s.toString("hex")
    const vHex = signature.v.toString(16).padStart(2, "0") // Convert bigint to hexadecimal and pad with leading zero if necessary
    return rHex + sHex + vHex
}

describe("BlockNumberAfterEnforcer", function () {
    const CONTACT_NAME = "Smart Account"
    const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" // Vitalik
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
  
    let SmartAccount: Contract
    let SmartAccount2: Contract
    let SmartAccount3: Contract
    let SmartAccountFactory: ContractFactory
    let Purpose: Contract
    let PurposeFactory: ContractFactory
    let BlockNumberEnforcer: Contract
    let BlockNumberAfterEnforcerFactory: ContractFactory

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

        BlockNumberAfterEnforcerFactory = await ethers.getContractFactory("BlockNumberAfterEnforcer")

        pk0 = wallet0._signingKey().privateKey
        pk1 = wallet1._signingKey().privateKey
        pk2 = wallet2._signingKey().privateKey
        pk3 = wallet3._signingKey().privateKey
        pk4 = wallet4._signingKey().privateKey
        pk5 = wallet5._signingKey().privateKey
        entryPoint = await new EntryPoint__factory(signer0).deploy()
    })
    
    beforeEach(async () => {
        Purpose = await PurposeFactory.connect(wallet0).deploy()
        SmartAccount = await SmartAccountFactory.connect(wallet0).deploy(
            entryPoint.address,
            [
                await wallet0.getAddress(),
                await wallet1.getAddress(),
            ], // signers
            2, // threshold
        )
        delegationSignaturePayloadTypes = SmartAccount.interface.getFunction("decodeAgnosticSignatures").outputs
        signaturePayloadTypes = SmartAccount.interface.getFunction("decodeSignature").outputs

        SmartAccount2 = await SmartAccountFactory.connect(wallet0).deploy(
            entryPoint.address,
            [
                await wallet2.getAddress(),
                await wallet3.getAddress(),
            ], // signers
            2, // threshold
        )

        SmartAccount3 = await SmartAccountFactory.connect(wallet0).deploy(
            entryPoint.address,
            [
                await wallet4.getAddress(),
                await wallet5.getAddress(),
            ], // signers
            2, // threshold
        )

        BlockNumberEnforcer = await BlockNumberAfterEnforcerFactory.connect(wallet0).deploy()
    
        eip712domain = {
            chainId: SmartAccount.deployTransaction.chainId,
            verifyingContract: SmartAccount.address,
            name: CONTACT_NAME,
            version: "1",
        }

        delegatableUtils = createSigningUtil(eip712domain, types.types)

        console.log("Smart Account address: ", SmartAccount.address)
        console.log("Smart Account 2 address: ", SmartAccount2.address)
        console.log("Wallet 0 address: ", await wallet0.getAddress())
        console.log("Wallet 1 address: ", await wallet1.getAddress())
        console.log("Wallet 2 address: ", await wallet2.getAddress())
        console.log("Wallet 3 address: ", await wallet3.getAddress())
        console.log("Wallet 4 address: ", await wallet4.getAddress())
    })

    it("should SUCCEED if delegated correctly after block number", async function () {
        const initialBalance = await hre.ethers.provider.getBalance(recipient)

        // Fund SmartAccount initially:
        await signer0.sendTransaction({
            to: SmartAccount.address,
            value: ethers.utils.parseEther("1"),
        })

        // Prepare Delegation:
        const delegation = {
            delegate: SmartAccount2.address,
            authority: "0x0000000000000000000000000000000000000000000000000000000000000000",
            caveats: [
                {
                    enforcer: BlockNumberEnforcer.address,
                    terms: "0x0000000000000000",
                },
            ],
            gasLimit: 0,
            nonce: 0,
        }
        const signedDelegation = signDelegation(delegation, [pk0, pk1])

        // Prepare UserOperation
        const userOp = await createSignedUserOp({
            sender: SmartAccount.address,
            initCode: "0x",
            callData: await callData(hre, SmartAccount.address, recipient, 1, "0x"), // send 1 wei to vitalik
        }, [signedDelegation], [pk2, pk3], SmartAccount.address)

        const tx = await entryPoint.handleOps([userOp], await signer0.getAddress(), { gasLimit: 30000000 })
        await tx.wait()

        expect((await hre.ethers.provider.getBalance(recipient)).toBigInt()).to.equal(initialBalance.toBigInt() + 1n)
    })

    it("should FAIL if before block number", async function () {
        const initialBalance = await hre.ethers.provider.getBalance(recipient)

        // Fund SmartAccount initially:
        await signer0.sendTransaction({
            to: SmartAccount.address,
            value: ethers.utils.parseEther("1"),
        })

        // Prepare Delegation:
        const delegation = {
            delegate: SmartAccount2.address,
            authority: "0x0000000000000000000000000000000000000000000000000000000000000000",
            caveats: [
                {
                    enforcer: BlockNumberEnforcer.address,
                    terms: "0x0000000000000400",
                },
            ],
            gasLimit: 0,
            nonce: 0,
        }
        const signedDelegation = signDelegation(delegation, [pk0, pk1])

        // Prepare UserOperation
        const userOp = await createSignedUserOp({
            sender: SmartAccount.address,
            initCode: "0x",
            callData: await callData(hre, SmartAccount.address, recipient, 1, "0x"), // send 1 wei to vitalik
        }, [signedDelegation], [pk2, pk3], SmartAccount.address)

        await expect(
            entryPoint.handleOps([userOp], await signer0.getAddress(), { gasLimit: 30000000 }
            )).to.be.reverted
    })
    
    
    function signDelegation (delegation: DelegationStruct, privateKeys: string[]): SignedDelegationStruct {
        const sigs = privateKeys.map(pk => delegatableUtils.signTypedDataLocal(pk.substring(2), "Delegation", delegation))
        const delegationSignaturePayload = sigs.map((delSig, i) => {
            return {
                contractAddress: ethers.constants.AddressZero,
                signature: delSig,
            }
        })

        if (!delegationSignaturePayloadTypes) throw new Error("No signature types found")

        const encodedDelegationSignaturePayload = ethers.utils.defaultAbiCoder.encode(
            delegationSignaturePayloadTypes,
            [delegationSignaturePayload]
        )

        const signedDelegation = {
            signature: encodedDelegationSignaturePayload,
            message: delegation,
            signer: SmartAccount.address,
        }
        return signedDelegation
    }

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
