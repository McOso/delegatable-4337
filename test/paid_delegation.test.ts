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

describe("paid delegation", function () {
    /**
     * This file is mostly a series of placeholders to document suggested future tests.
     */
 
    /**
     * This test is a placeholder for a test that checks that a user can delegate a right to transfer to a dex.
     * A first caveat would be one that ensures this delegation can only transfer the specified asset.
     * A second caveat could be an expiration date, or even a price changing over time.
     * A third caveat restricts buying to a known set of buyers.
     * The recipient of the delegation could be a simple DEX.
     * 
     * The DEX should allow an approved user to purchase the asset with an ERC20 token.
     * The DEX should allow the buyer to provide their allowance to the DEX as a delegation also.
     * function buyAsset (Delegation buyerTokenAllowance, Delegation sellerTokenOffer); 
     * 
     * Together, this means one transaction can allow a user to purchase an asset with an ERC20 token.
     * 
     * A later version of this test could allow selling a counterfactual asset for an ERC20 token.
     * Another variation of this test could allow the seller to not have their account on-chain yet:
     * In that case, a caveat of the original delegation might be an initCode consuming contract publisher,
     * It may also include a caveat for ensuring the asset is published on chain as part of the transaction.
     *
     * Still needs strategy for transitive delegation of this right.
     * function initiateTrade (Delegation buyerTokenAllowance, Delegation[] tokenSellingRight);
     * Walks the tokenSellingRight, needs to be able to perform the swaps in sequence.
     * 
     */
    it("Can delegate a right to transfer to a dex")
})
