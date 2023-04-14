//SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./../TypesAndDecoders.sol";

abstract contract CaveatEnforcer {
    function enforceCaveat(
        bytes calldata terms,
        bytes calldata func,
        bytes32 delegationHash
    ) public virtual returns (bool);
}
