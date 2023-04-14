import { ethers } from "hardhat";
import { EntryPoint, EntryPoint__factory } from "@account-abstraction/contracts"
import { Contract, ContractFactory, utils, Wallet } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import hre from "hardhat"
import { getPrivateKeys } from "../scripts/utils/getPrivateKeys";
import { Delegatable4337Account__factory } from "../typechain-types"
import { Provider } from "@ethersproject/providers";
import { callData, fillUserOp } from "../scripts/runOp"
import { expect } from "chai"
// @ts-ignore
import { createSigningUtil } from "../scripts/signTypedData";
import { arrayify, hexConcat } from "ethers/lib/utils";
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
    let CONTRACT_INFO: any;
    let delegatableUtils: any;
    let signer0: SignerWithAddress;
    let wallet0: Wallet;
    let wallet1: Wallet;
    let pk0: string;
    let pk1: string;
    let entryPoint: EntryPoint
  
    let AllowedMethodsEnforcer: Contract;
    let AllowedMethodsEnforcerFactory: ContractFactory;
    let SmartAccount: Contract;
    let SmartAccountFactory: ContractFactory;
    let Purpose: Contract;
    let PurposeFactory: ContractFactory;

    before(async () => {
        [signer0] = await getSigners();
        
        [wallet0, wallet1] = getPrivateKeys(
          signer0.provider as unknown as Provider
        );
        SmartAccountFactory = await ethers.getContractFactory("Delegatable4337Account");
        PurposeFactory = await ethers.getContractFactory("Purpose");
        // AllowedMethodsEnforcerFactory = await ethers.getContractFactory(
        //   "AllowedMethodsEnforcer"
        // );
        pk0 = wallet0._signingKey().privateKey;
        pk1 = wallet1._signingKey().privateKey;
      });
    
    beforeEach(async () => {
        entryPoint = await new EntryPoint__factory(signer0).deploy()

        Purpose = await PurposeFactory.connect(wallet0).deploy();
        SmartAccount = await SmartAccountFactory.connect(wallet0).deploy(
            entryPoint.address,
            [await signer0.getAddress()], // signers
            1, // threshold
        );
        // AllowedMethodsEnforcer = await AllowedMethodsEnforcerFactory.connect(
        //   wallet0
        // ).deploy();
    
        CONTRACT_INFO = {
          chainId: SmartAccount.deployTransaction.chainId,
          verifyingContract: SmartAccount.address,
          name: CONTACT_NAME,
        };

        delegatableUtils = createSigningUtil(CONTRACT_INFO, types);
    });

    it("should succeed if signed correctly", async function () {
        const signer = hre.ethers.provider.getSigner()
        console.log("signer", await signer.getAddress())

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

        const sign = ecsign(Buffer.from(arrayify(hash)), Buffer.from(arrayify(pk0)))
        const hexsign = "0x" + signatureToHexString(sign)

        //const signature = await signer.signMessage(arrayify(hash))
        // ecrover the signature using the hash

        const recovered = await signer.getAddress()

        userOp.signature = hexsign

        console.log(hexsign.length)

        // convert bytes to string
        const string = ethers.utils.toUtf8String("0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000164141323320726576657274656420286f72204f4f472900000000000000000000")
        console.log(string)

        const tx = await entryPoint.handleOps([userOp], await signer.getAddress(), { gasLimit: 10000000 })
        await tx.wait()

        expect(hre.ethers.provider.getBalance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).to.equal(1)
    })
})

