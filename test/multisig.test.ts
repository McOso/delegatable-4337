import { ethers } from "hardhat";
import { EntryPoint, EntryPoint__factory } from "@account-abstraction/contracts"
import { Contract, ContractFactory, utils, Wallet } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { arrayify, defaultAbiCoder, hexConcat, hexlify, keccak256 } from "ethers/lib/utils";
import hre from "hardhat"
import { getPrivateKeys } from "../scripts/utils/getPrivateKeys";
import { Delegatable4337Account, Delegatable4337Account__factory } from "../typechain-types"
import { Provider } from "@ethersproject/providers";
import { callData, UserOpStruct } from "../scripts/runOp"
import { expect } from "chai"
// @ts-ignore
import { createSigningUtil } from "../scripts/signTypedData";
import { ecsign } from "ethereumjs-util";
const types = require('../scripts/types.js');
const { getSigners } = ethers;

function signatureToHexString(signature: any) {
    const rHex = signature.r.toString('hex');
    const sHex = signature.s.toString('hex');
    const vHex = signature.v.toString(16).padStart(2, '0'); // Convert bigint to hexadecimal and pad with leading zero if necessary
    return rHex + sHex + vHex;
  }

describe("no delegation", function () {
    const CONTACT_NAME = "Smart Account";
    let eip712domain: any;
    let delegatableUtils: any;
    let signer0: SignerWithAddress;
    let signer1: SignerWithAddress;
    let wallet0: Wallet;
    let wallet1: Wallet;
    let wallet2: Wallet;
    let pk0: string;
    let pk1: string;
    let pk2: string;
    let entryPoint: EntryPoint
  
    let AllowedMethodsEnforcer: Contract;
    let AllowedMethodsEnforcerFactory: ContractFactory;
    let SmartAccount: Contract;
    let SmartAccountFactory: ContractFactory;
    let Purpose: Contract;
    let PurposeFactory: ContractFactory;

    before(async () => {
        [signer0, signer1] = await getSigners();
      
        // These ones have private keys, so can be used for delegation signing:
        [wallet0, wallet1, wallet2] = getPrivateKeys(
          signer0.provider as unknown as Provider
        );
        SmartAccountFactory = await ethers.getContractFactory("Delegatable4337Account");
        PurposeFactory = await ethers.getContractFactory("Purpose");
        // AllowedMethodsEnforcerFactory = await ethers.getContractFactory(
        //   "AllowedMethodsEnforcer"
        // );
        pk0 = wallet0._signingKey().privateKey;
        pk1 = wallet1._signingKey().privateKey;
        entryPoint = await new EntryPoint__factory(signer0).deploy()
      });
    
    beforeEach(async () => {
        Purpose = await PurposeFactory.connect(wallet0).deploy();
        SmartAccount = await SmartAccountFactory.connect(wallet0).deploy(
            entryPoint.address,
            [
              await wallet0.getAddress(),
              await wallet1.getAddress(),
              await wallet1.getAddress(),
            ], // signers
            2, // threshold
        );
        // AllowedMethodsEnforcer = await AllowedMethodsEnforcerFactory.connect(
        //   wallet0
        // ).deploy();
    
        eip712domain = {
          chainId: SmartAccount.deployTransaction.chainId,
          verifyingContract: SmartAccount.address,
          name: CONTACT_NAME,
        };

        delegatableUtils = createSigningUtil(eip712domain, types);
    });

    it("should succeed if signed correctly", async function () {
        const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
        const initialBalance = await hre.ethers.provider.getBalance(recipient);

        await signer0.sendTransaction({
            to: SmartAccount.address,
            value: ethers.utils.parseEther("1"),
        })

        const userOp = await fillUserOp(hre, {
            sender: SmartAccount.address,
            initCode: "0x",
            callData: await callData(hre, SmartAccount.address, recipient, 1, "0x"), // send 1 wei to vitalik
          }, SmartAccount as Delegatable4337Account);

        const hash = await entryPoint.getUserOpHash(userOp)

        const sign = ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk0)))
        const sign2 = ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk1)))
        const hexsign = "0x" + signatureToHexString(sign) + signatureToHexString(sign2)

        const signaturePayload = {
          signatures: hexsign,
          delegations: [],
        };

        const signaturePayloadTypes = SmartAccount.interface.getFunction('decodeSignature').outputs;
        if (!signaturePayloadTypes) throw new Error('No signature types found');

        const encodedSignaturePayload = ethers.utils.defaultAbiCoder.encode(
          signaturePayloadTypes,
          [signaturePayload]
        );

        userOp.signature = encodedSignaturePayload;

        // convert bytes to string
        const string = ethers.utils.toUtf8String("0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000164141323320726576657274656420286f72204f4f472900000000000000000000")

        try {
          const tx = await entryPoint.handleOps([userOp], await signer0.getAddress(), { gasLimit: 10000000 })
          await tx.wait()
        } catch (err) {

        }

        expect((await hre.ethers.provider.getBalance(recipient)).toBigInt()).to.equal(initialBalance.toBigInt() + 1n);
    });

    it("should fail if signed by the wrong address", async function () {
      const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
      const initialBalance = await hre.ethers.provider.getBalance(recipient);

      await signer0.sendTransaction({
          to: SmartAccount.address,
          value: ethers.utils.parseEther("1"),
      })

      const userOp = await fillUserOp(hre, {
          sender: SmartAccount.address,
          initCode: "0x",
          callData: await callData(hre, SmartAccount.address, recipient, 1, "0x"), // send 1 wei to vitalik
        }, SmartAccount as Delegatable4337Account);

      const hash = await entryPoint.getUserOpHash(userOp)

      const sign = ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk1)))
      const hexsign = "0x" + signatureToHexString(sign)

      const signaturePayload = {
        signatures: hexsign,
        delegations: [],
      };

      const signaturePayloadTypes = SmartAccount.interface.getFunction('decodeSignature').outputs;
      if (!signaturePayloadTypes) throw new Error('No signature types found');

      const encodedSignaturePayload = ethers.utils.defaultAbiCoder.encode(
        signaturePayloadTypes,
        [signaturePayload]
      );

      userOp.signature = encodedSignaturePayload;

      // convert bytes to string
      const string = ethers.utils.toUtf8String("0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000164141323320726576657274656420286f72204f4f472900000000000000000000")

      try {
        console.log('handling ops');
        const tx = await entryPoint.handleOps([userOp], await signer0.getAddress(), { gasLimit: 10000000 })
        await tx.wait()
        console.log('handle op');
        console.log('waited');
      } catch (err) {
        console.log('error');
        console.log(err);
      }

      expect((await hre.ethers.provider.getBalance(recipient)).toBigInt()).to.equal(initialBalance.toBigInt());
  });
})

async function fillUserOp(hre: HardhatRuntimeEnvironment, userOp:Partial<UserOpStruct>, sender: Delegatable4337Account) : Promise<UserOpStruct> {
  if(await hre.ethers.provider.getCode(userOp.sender!) == '0x') {
    userOp.nonce = hexlify(0);
  } else {
    userOp.nonce = hexlify((await sender.getNonce()).toNumber());
  }
  userOp.callGasLimit = hexlify(300000);
  userOp.verificationGasLimit = hexlify(3000000);
  userOp.preVerificationGas = hexlify(3000000);

  const gasPrice = (await hre.ethers.provider.getGasPrice()).mul(2)

  userOp.maxFeePerGas = hexlify(gasPrice);
  userOp.maxPriorityFeePerGas = hexlify(gasPrice);
  userOp.paymasterAndData = hexlify('0x');
  userOp.signature = hexlify('0x');
  return userOp as UserOpStruct;
}
