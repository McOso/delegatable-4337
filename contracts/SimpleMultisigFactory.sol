// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SimpleMultisig.sol";

contract SimpleMultisigFactory {
    // Salt value used to compute the deterministic address
    uint256 public salt;

    event SimpleMultisigCreated(address indexed multisig);

    constructor(uint256 _salt) {
        salt = _salt;
    }

    function createMultisig(address[] memory _owners, uint8 _threshold, uint256 _instanceSalt) public returns (address) {
        bytes memory bytecode = type(SimpleMultisig).creationCode;
        bytes32 saltValue = keccak256(abi.encodePacked(salt, _instanceSalt));
        address multisigAddress;

        assembly {
            multisigAddress := create2(0, add(bytecode, 0x20), mload(bytecode), saltValue)
        }

        require(multisigAddress != address(0), "SimpleMultisigFactory: Failed to deploy SimpleMultisig");

        SimpleMultisig multisig = SimpleMultisig(multisigAddress);
        multisig.initialize(_owners, _threshold);

        emit SimpleMultisigCreated(multisigAddress);
        return multisigAddress;
    }
}
