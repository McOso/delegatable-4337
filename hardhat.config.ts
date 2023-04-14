import { HardhatUserConfig } from "hardhat/config";
import fs from 'fs'
import { task } from "hardhat/config";
import { sendUserOperation, callData, fillUserOp, signUserOp, signUserOpWithPaymaster, estimateUserOperationGas, getUserOperationReceipt, deployAccount } from "./scripts/runOp";
import "@nomiclabs/hardhat-ethers";
import { hexlify } from "ethers/lib/utils";
import { Signer, Wallet, ethers } from "ethers";
import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import { Delegatable4337Account, Delegatable4337Account__factory } from "./typechain-types";
require('dotenv').config();

const infuraKey = process.env.INFURA_KEY;
const mnemonicFileName = process.env.MNEMONIC_FILE
if (infuraKey == null) {
  throw new Error("Please set your INFURA_KEY in a .env file");
}

if (mnemonicFileName == null) {
  throw new Error("Please set your MNEMONIC_FILE in a .env file");
}

let mnemonic: string
if (fs.existsSync(mnemonicFileName)) {
  mnemonic = fs.readFileSync(mnemonicFileName, 'ascii').trim()
} else {
  throw new Error(`Mnemonic file ${mnemonicFileName} not found`)
}

function getNetwork(network : string) {
  console.log(`Using ${network} network`)
  const config = {
    url: `https://${network}.infura.io/v3/${infuraKey}`,
    accounts: mnemonic.startsWith('0x') ? [mnemonic] : {
      mnemonic: mnemonic,
    },
  };
  return config;
}

const config: HardhatUserConfig = {
  typechain: {
    target: "ethers-v5",
  },
  solidity: {
    version: "0.8.18",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 20
      }
    },
  },
  networks: {
    goerli: getNetwork('goerli'),
    arbitrum: getNetwork('arbitrum-mainnet'),
    "linea-testnet": {
      url: `https://rpc.goerli.linea.build/`,
      accounts: mnemonic.startsWith('0x') ? [mnemonic] : {
        mnemonic: mnemonic,
      },
    },
  },
};

const paymasterFlow = async (hre: any, contract?: string, usePaymaster = true) => {
    console.log("Getting signer...")
    // get hardhat signer as owner
    const signer = await hre.ethers.getSigner()
    const signerAddress = await signer.getAddress()
    console.log("Got signer:", signerAddress)
    let initCode = "0x";

    let delegatable4337Account
    if (contract) {
      delegatable4337Account = new Delegatable4337Account__factory(signer).attach(contract)
      console.log("Delegatable4337Account attached:", delegatable4337Account.address);
    } else {
      console.log("Delegatable4337Account is not deployed, deploying...");
      delegatable4337Account = await deployAccount(hre, signerAddress, signer);
      console.log("Delegatable4337Account deployed:", delegatable4337Account.address);
    }
    const userOp = await fillUserOp(hre, {
      sender: delegatable4337Account.address,
      initCode: initCode,
      callData: await callData(hre, signer.address, 0, "0x"),
    });
    console.log("---------------------------------------------")
    console.log("User Operation created:")
    console.log(userOp)
    
    console.log("---------------------------------------------")
    if (usePaymaster) {
      console.log("Requesting Pimlico paymaster sponsorship (pm_sponsorUserOperation)...")
      userOp.paymasterAndData = hexlify(await signUserOpWithPaymaster(hre, userOp));
      console.log("Pimlico paymasterAndData received:", userOp.paymasterAndData)
      console.log("---------------------------------------------")
    }
    console.log("Signing user operation with owner...")
    userOp.signature = hexlify(await signUserOp(hre, userOp, signer));
    console.log("User operation signature generated:", userOp.signature)
    console.log("---------------------------------------------")
    console.log("Sending user operation to Pimlico bundler (eth_sendUserOperation)...")
    const userOpHash = await sendUserOperation(hre, userOp);
    console.log("User operation hash received: ", userOpHash);
    console.log("---------------------------------------------")
    console.log("Waiting for user operation receipt (eth_getUserOperationReceipt)...")
    let receipt = await getUserOperationReceipt(hre, userOpHash)
    while (receipt == null) {
      await new Promise(r => setTimeout(r, 1000));
      console.log("Waiting for user operation receipt (eth_getUserOperationReceipt)...")
      receipt = await getUserOperationReceipt(hre, userOpHash)
    }
    console.log("User operation receipt received:", receipt);
    console.log("Pimlico example flow complete!")
}

// test with paymaster flow and bundler flow - api key should be loaded up with balance for this to work
task("test-paymaster", "Test paymaster")
  .addOptionalParam('contract', 'Delegatable4337Contract address')
  .setAction(async (taskArgs, hre) => {
    await paymasterFlow(hre, taskArgs.contract)
  });

// test with bundler flow only
task("test-bundler", "Test bundler")
  .addOptionalParam('contract', 'Delegatable4337Contract address')
  .setAction(async (taskArgs, hre) => {
    paymasterFlow(hre, taskArgs.contract, false)
  });

// verify contract on etherscan
task("verify", "Verifies contract on etherscan")
  .setAction(async (taskArgs, hre) => {
    await hre.run("verify:verify", {
      address: "0x18611e0949cc7b950afe144a8f280f96ab4fb6f6",
      constructorArguments: [
        "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "0x14a004ce9a5d7d94547e48315c0cd3c1b9c40c32"
      ]})})
      

export default config;
