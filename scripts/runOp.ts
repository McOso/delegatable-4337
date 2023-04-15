import { JsonRpcProvider } from "@ethersproject/providers"
import { BigNumberish, Signer } from "ethers"
import { EntryPoint__factory } from "@account-abstraction/contracts"
import { Delegatable4337Account, Delegatable4337Account__factory } from "../typechain-types"
import { arrayify, defaultAbiCoder, hexConcat, hexlify, keccak256 } from "ethers/lib/utils"
import { HardhatRuntimeEnvironment } from "hardhat/types"

require("dotenv").config()

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY
const config = require("../configs/config.json")

function getBundlerUrl(network : string) : string {
    return `https://api.pimlico.io/v1/${network}/rpc?apikey=${PIMLICO_API_KEY}`
}

export interface UserOpStruct {
  sender: string,
  nonce: BigNumberish,
  initCode : string,
  callData : string,
  callGasLimit : BigNumberish,
  verificationGasLimit : BigNumberish,
  preVerificationGas : BigNumberish,
  maxFeePerGas : BigNumberish,
  maxPriorityFeePerGas : BigNumberish,
  paymasterAndData : string,
  signature : string
}

export async function sendUserOperation(hre : HardhatRuntimeEnvironment, userOp : UserOpStruct): Promise<string> {
    const bundlerProvider = new JsonRpcProvider(getBundlerUrl(hre.network.name))
    const receipt = await bundlerProvider.send("eth_sendUserOperation", [
        userOp,
        config[hre.network.name].entrypoint,
    ])
    return receipt
}

export async function estimateUserOperationGas(hre : HardhatRuntimeEnvironment, userOp : UserOpStruct) {
    const bundlerProvider = new JsonRpcProvider(getBundlerUrl(hre.network.name))
    const {preVerificationGas, verificationGas, callGasLimit} = await bundlerProvider.send("eth_estimateUserOperationGas", [
        userOp,
        config[hre.network.name].entrypoint,
    ])

    return {preVerificationGas, verificationGas, callGasLimit}
}

export async function getUserOperationReceipt(hre : HardhatRuntimeEnvironment, userOpHash : string): Promise<any> {
    const bundlerProvider = new JsonRpcProvider(getBundlerUrl(hre.network.name))
    const receipt = await bundlerProvider.send("eth_getUserOperationReceipt", [
        userOpHash,
    ])
    return receipt
}

export async function signUserOp(hre: HardhatRuntimeEnvironment, userOp : UserOpStruct, signer : Signer) : Promise<string> {
    const entryPoint = EntryPoint__factory.connect(config[hre.network.name].entrypoint, hre.ethers.provider)
    const signature = await signer.signMessage(arrayify(await entryPoint.getUserOpHash(userOp)))
    return signature
}

export async function callData(hre: HardhatRuntimeEnvironment, accountAddress: string, to : string, value: BigNumberish, data: string) : Promise<string> {
    const account = Delegatable4337Account__factory.connect(accountAddress, hre.ethers.provider)
    return account.interface.encodeFunctionData("execute", [to, value, data])
}

export async function fillUserOp(hre: HardhatRuntimeEnvironment, userOp:Partial<UserOpStruct>) : Promise<UserOpStruct> {
    const signer = hre.ethers.provider.getSigner()
    const sender = Delegatable4337Account__factory.connect(userOp.sender!, signer)
    if(await hre.ethers.provider.getCode(userOp.sender!) === "0x") {
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

export async function signUserOpWithPaymaster(hre: HardhatRuntimeEnvironment, userOp : UserOpStruct) : Promise<string> {
    const bundlerProvider = new JsonRpcProvider(getBundlerUrl(hre.network.name))
    const signature = await bundlerProvider.send("pm_sponsorUserOperation", [
        userOp,
        {
            entryPoint : config[hre.network.name].entrypoint,
        }
    ])
    return signature.paymasterAndData
}

export async function deployAccount(hre: HardhatRuntimeEnvironment, owner : string, signer: Signer) : Promise<Delegatable4337Account> {
    const account = await new Delegatable4337Account__factory(signer).deploy(config[hre.network.name].entrypoint, [owner], 1)
    // verify contract
    //
    // await hre.run("verify:verify", {
    //   address: account.address,
    //   constructorArguments: [config[hre.network.name].entrypoint, owner],
    // });
    return account
}

export function getUserOpHash(op: UserOpStruct, entryPoint: string, chainId: number): string {
    const hashedUserOp = {
        sender: op.sender,
        nonce: op.nonce,
        initCodeHash: keccak256(op.initCode),
        callDataHash: keccak256(op.callData),
        callGasLimit: op.callGasLimit,
        verificationGasLimit: op.verificationGasLimit,
        preVerificationGas: op.preVerificationGas,
        maxFeePerGas: op.maxFeePerGas,
        maxPriorityFeePerGas: op.maxPriorityFeePerGas,
        paymasterAndDataHash: keccak256(op.paymasterAndData)
    }

    const userOpType = {
        components: [
            { type: "address", name: "sender" },
            { type: "uint256", name: "nonce" },
            { type: "bytes32", name: "initCodeHash" },
            { type: "bytes32", name: "callDataHash" },
            { type: "uint256", name: "callGasLimit" },
            { type: "uint256", name: "verificationGasLimit" },
            { type: "uint256", name: "preVerificationGas" },
            { type: "uint256", name: "maxFeePerGas" },
            { type: "uint256", name: "maxPriorityFeePerGas" },
            { type: "bytes32", name: "paymasterAndDataHash" },
        ],
        name: "hashedUserOp",
        type: "tuple",
    }
    let encoded = defaultAbiCoder.encode([userOpType as any], [{ ...hashedUserOp }])
    // remove leading word (total length) and trailing word (zero-length signature)

    const userOpHash = keccak256(encoded)
    const enc = defaultAbiCoder.encode(["bytes32", "address", "uint256"], [userOpHash, entryPoint, chainId])
    return keccak256(enc)
}