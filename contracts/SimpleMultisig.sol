// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract SimpleMultisig {
    using ECDSA for bytes32;

    mapping(address => bool) public isOwner;
    uint8 public threshold;

    // EIP-1271 magic value
    bytes4 constant internal EIP1271_MAGIC_VALUE = 0x1626ba7e;

    constructor(address[] memory _owners, uint8 _threshold) {
        require(_owners.length > 0, "SimpleMultisig: At least one owner required");
        require(_threshold > 0 && _threshold <= _owners.length, "SimpleMultisig: Invalid threshold");

        for (uint256 i = 0; i < _owners.length; i++) {
            isOwner[_owners[i]] = true;
        }
        threshold = _threshold;
    }

    function isValidSignature(bytes32 _hash, bytes memory _signatures)
        public
        view
        returns (bytes4)
    {
        require(_signatures.length % 65 == 0, "SimpleMultisig: Invalid signature length");

        uint8 signatureCount = uint8(_signatures.length / 65);
        require(signatureCount >= threshold, "SimpleMultisig: Not enough signatures");

        mapping(address => bool) memory usedAddresses;
        uint8 validSignatureCount = 0;

        for (uint8 i = 0; i < signatureCount; i++) {
            bytes memory signature = slice(_signatures, i * 65, 65);
            address recoveredAddress = _hash.recover(signature);

            if (isOwner[recoveredAddress] && !usedAddresses[recoveredAddress]) {
                usedAddresses[recoveredAddress] = true;
                validSignatureCount++;

                if (validSignatureCount >= threshold) {
                    return EIP1271_MAGIC_VALUE;
                }
            }
        }

        return 0;
    }

    function slice(bytes memory data, uint256 start, uint256 length) private pure returns (bytes memory) {
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = data[start + i];
        }
        return result;
    }
}
