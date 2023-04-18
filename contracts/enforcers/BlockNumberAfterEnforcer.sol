//SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../delegatable/CaveatEnforcer.sol";
import {BytesLib} from "../libraries/BytesLib.sol";

contract BlockNumberAfterEnforcer is CaveatEnforcer {
    /**
     * @notice Allows the delegator to specify the latest block the delegation will be valid.
     * @param terms - The range of blocks this delegation is valid. See test for example.
     * @param func - The bytes the delegate might try to perform which include to, value, and function/data.
     * @param delegationHash - The hash of the delegation being operated on.
     */
    function enforceCaveat(
        bytes calldata terms,
        bytes calldata func,
        bytes32 delegationHash
    ) public override returns (bool) {
        uint64 blockThreshold = BytesLib.toUint64(terms, 0);
        if (blockThreshold < block.number) {
            return true;
        } else {
            revert("BlockNumberAfterEnforcer:early-delegation");
        }
    }
}
