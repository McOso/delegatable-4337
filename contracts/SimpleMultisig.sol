// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712Decoder, ERC1271Contract} from "./TypesAndDecoders.sol";

struct ContractAgnosticSignature {
    bytes signature;
    address contractAddress;
}

abstract contract SimpleMultisig is EIP712Decoder {
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

    function decodeAgnosticSignatures(bytes calldata signatureField) public pure returns (ContractAgnosticSignature[] memory payload) {
        payload = abi.decode(signatureField, (ContractAgnosticSignature[]));
        return payload;
    }

    function isValidSignature(bytes32 _hash, bytes calldata _signatures)
        public
        view
        virtual
        returns (bytes4)
    {
        console.log("Decoding");
        ContractAgnosticSignature[] memory signatures = decodeAgnosticSignatures(_signatures);
        uint256 signatureCount = signatures.length;
        console.log("%d signatures", signatureCount);

        if (signatureCount < threshold) {
            return 0;
        }

        address[] memory usedAddresses = new address[](signatureCount);
        bool[] memory isUsed = new bool[](signatureCount);
        uint8 validSignatureCount = 0;

        for (uint8 i = 0; i < signatureCount; i++) {
            ContractAgnosticSignature memory signature = signatures[i];

            if (signature.contractAddress != 0x0000000000000000000000000000000000000000) {
                // EIP-1271 signature verification
                bytes4 result = ERC1271Contract(signature.contractAddress).isValidSignature(_hash, signature.signature);
                return result;
            }
            console.log("Just an EOA");

            address recoveredAddress = recover(_hash, signature.signature);
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
