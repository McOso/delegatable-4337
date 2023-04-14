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
        override
        virtual
        returns (bytes4)
    {
        uint8 signatureCount = uint8(_signatures.length / 65);

        if (signatureCount < threshold) {
            return 0;
        }

        address[] memory usedAddresses = new address[](signatureCount);
        bool[] memory isUsed = new bool[](signatureCount);
        uint8 validSignatureCount = 0;

        for (uint8 i = 0; i < signatureCount; i++) {
            if (_signatures.length < (i + 1) * 65) {
                break;
            }

            bytes memory signature = slice(_signatures, i * 65, 65);
            bytes32 r;
            bytes32 s;
            uint8 v;

            // Divide the signature into r, s and v values
            assembly {
                r := mload(add(signature, 0x20))
                s := mload(add(signature, 0x40))
                v := byte(0, mload(add(signature, 0x60)))
            }

            // Recover the signer's address
            address recoveredAddress = ecrecover(_hash, v, r, s);

            // If the address is the zero address, the signature recovery has failed
            if (recoveredAddress == address(0)) {
                continue;
            }

            if (isOwner[recoveredAddress] && !isAddressUsed(usedAddresses, isUsed, recoveredAddress)) {
                markAddressAsUsed(usedAddresses, isUsed, recoveredAddress);
                validSignatureCount++;

                if (validSignatureCount >= threshold) {
                    return EIP1271_MAGIC_VALUE;
                }
            }
        }

        return 0;
    }


    function isAddressUsed(address[] memory usedAddresses, bool[] memory isUsed, address addr) private pure returns (bool) {
        for (uint256 i = 0; i < usedAddresses.length; i++) {
            if (usedAddresses[i] == addr) {
                return isUsed[i];
            }
        }
        return false;
    }

    function markAddressAsUsed(address[] memory usedAddresses, bool[] memory isUsed, address addr) private pure {
        for (uint256 i = 0; i < usedAddresses.length; i++) {
            if (usedAddresses[i] == addr || usedAddresses[i] == address(0)) {
                usedAddresses[i] = addr;
                isUsed[i] = true;
                break;
            }
        }
    }


    function slice(bytes memory data, uint256 start, uint256 length) private pure returns (bytes memory) {
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = data[start + i];
        }
        return result;
    }
}
