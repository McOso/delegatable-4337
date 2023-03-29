import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumberish, Signer } from "ethers";
import { SimpleAccountFactory__factory, SimpleAccountFactory, EntryPoint__factory, SimpleAccount, SimpleAccount__factory } from "@account-abstraction/contracts";
import { arrayify, hexConcat, hexlify } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";

require('dotenv').config();

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
const config = require('../configs/config.json');

function getBundlerUrl(network : string) : string {
  return `https://api.pimlico.io/v1/${network}/rpc?apikey=${PIMLICO_API_KEY}`
}

interface UserOpStruct {
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

export async function runOp1(hre : HardhatRuntimeEnvironment, userOp : UserOpStruct) {
  const bundlerProvider = new JsonRpcProvider(getBundlerUrl(hre.network.name));
  const receipt = await bundlerProvider.send("eth_sendUserOperation", [
    userOp,
    config[hre.network.name].entrypoint,
  ]);
  console.log("Receipt: ", receipt);
}

export async function signUserOp(hre: HardhatRuntimeEnvironment, userOp : UserOpStruct, signer : Signer) : Promise<string> {
  console.log("signer addr" + await signer.getAddress());
  const entryPoint = EntryPoint__factory.connect(config[hre.network.name].entrypoint, hre.ethers.provider);
  const signature = await signer.signMessage(arrayify(await entryPoint.getUserOpHash(userOp)));
  console.log(signature);
  return signature;
}

export async function callData(hre: HardhatRuntimeEnvironment, to : string, value: BigNumberish, data: string) : Promise<string> {
  const account = SimpleAccount__factory.connect(config[hre.network.name].factory, hre.ethers.provider);
  return account.interface.encodeFunctionData('execute', [to, value, data]);
}

export async function fillUserOp(hre: HardhatRuntimeEnvironment, userOp:Partial<UserOpStruct>) : Promise<UserOpStruct> {
  const signer = hre.ethers.provider.getSigner();
  const sender = SimpleAccount__factory.connect(userOp.sender!, signer);
  if(await hre.ethers.provider.getCode(userOp.sender!) == '0x') {
    userOp.nonce = hexlify(0);
  } else {
    userOp.nonce = hexlify((await sender.nonce()).toNumber());
  }
  userOp.callGasLimit = hexlify(1000000);
  userOp.verificationGasLimit = hexlify(1000000);
  userOp.preVerificationGas = hexlify(1000000);

  const gasPrice = await hre.ethers.provider.getGasPrice()

  userOp.maxFeePerGas = hexlify(gasPrice);
  userOp.maxPriorityFeePerGas = hexlify(gasPrice);
  userOp.paymasterAndData = hexlify('0x');
  userOp.signature = hexlify('0x');
  return userOp as UserOpStruct;
}

export async function signUserOpWithPaymaster(hre: HardhatRuntimeEnvironment, userOp : UserOpStruct) : Promise<string> {
  const bundlerProvider = new JsonRpcProvider(getBundlerUrl(hre.network.name));
  const signature = await bundlerProvider.send("pm_sponsorUserOperation", [
    userOp,
    {
      entryPoint : config[hre.network.name].entrypoint,
    }
  ]);
  console.log("Signature: ", signature.paymasterAndData);
  return signature.paymasterAndData;
}

export function getInitCode(hre: HardhatRuntimeEnvironment, owner : string, nonce : BigNumberish) : string {
  const factory = SimpleAccountFactory__factory.connect(config[hre.network.name].factory, hre.ethers.provider);
  const data = hexConcat([factory.address, factory.interface.encodeFunctionData('createAccount', [owner, nonce])]);
  return data;
}

export async function getSender(hre : HardhatRuntimeEnvironment, owner : string, nonce : BigNumberish) : Promise<SimpleAccount> {
  const signer = hre.ethers.provider.getSigner();
  const entryPoint = EntryPoint__factory.connect(config[hre.network.name].entrypoint, signer);
  const initCode = getInitCode(hre, owner, nonce);
  const sender : string = await entryPoint.getSenderAddress(initCode).then(x => {
    throw new Error("should be reverted");
  }).catch((e) => {
    const data = e.message.split('0x6ca7b806')[1].split("\"")[0];
    const addr = hre.ethers.utils.getAddress('0x' + data.slice(24, 64));
    return addr;
  });
  return SimpleAccount__factory.connect(sender, hre.ethers.provider);
}