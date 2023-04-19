import { ethers } from "hardhat"
import { EntryPoint, EntryPoint__factory } from "@account-abstraction/contracts"
import { Contract, ContractFactory, utils, Wallet } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
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
import { DelegationStruct, SignedDelegationStruct } from "../typechain-types/contracts/SimpleMultisig"
const types = require("../scripts/types.js")
const { getSigners } = ethers

function signatureToHexString(signature: any) {
    const rHex = signature.r.toString("hex")
    const sHex = signature.s.toString("hex")
    const vHex = signature.v.toString(16).padStart(2, "0") // Convert bigint to hexadecimal and pad with leading zero if necessary
    return rHex + sHex + vHex
}

describe("inter-contract delegation", function () {
    /**
     * This file is mostly a series of placeholders to document suggested future tests.
     */
 
    /**
     * This test is a placeholder for a test that checks that a contract can redeem a delegation.
     * This would be similar to the `contractInvoke` method in the original Delegatable Core contract.
     * 
     * This provides a mechanism for a non-owner/non-entrypoint contract to redeem a delegation.
     */
    it("Can delegate a right to another contract, to be used as part of an internal transaction")
})
