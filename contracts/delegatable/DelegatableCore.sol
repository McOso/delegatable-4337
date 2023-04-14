// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {EIP712Decoder, EIP712DOMAIN_TYPEHASH} from "./TypesAndDecoders.sol";
import {Delegation, Invocation, Invocations, SignedInvocation, SignedDelegation, Transaction, ReplayProtection, CaveatEnforcer} from "./CaveatEnforcer.sol";

abstract contract DelegatableCore is EIP712Decoder {
    /// @notice Account delegation nonce manager

    /**
     * validate the signature is valid for this message.
     * @param userOp validate the userOp.signature field
     * @param userOpHash convenient field: the hash of the request, to check the signature against
     *          (also hashes the entrypoint and chain id)
     * @return validationData signature and time-range of this operation
     *      <20-byte> sigAuthorizer - 0 for valid signature, 1 to mark signature failure,
     *         otherwise, an address of an "authorizer" contract.
     *      <6-byte> validUntil - last timestamp this operation is valid. 0 for "indefinite"
     *      <6-byte> validAfter - first timestamp this operation is valid
     *      If the account doesn't use time-range, it is enough to return SIG_VALIDATION_FAILED value (1) for signature failure.
     *      Note that the validation code cannot use block.timestamp (or block.number) directly.
     */
  function _validateSignature(UserOperation calldata userOp, bytes32 userOpHash)
    internal virtual returns (uint256 validationData)
    {
        _requireFromEntryPoint();

        // Decode delegations
        SignedDelegation[] calldata delegations = decodeDelegationArray(userOp.signature);

        address intendedSender = userOp.sender;
        address canGrant = intendedSender;
        bytes32 authHash = 0x0;

        uint256 delegationsLength = delegations.length;
        unchecked {
            for (uint256 d = 0; d < delegationsLength; d++) {
                SignedDelegation calldata signedDelegation = delegations[d];
                address delegationSigner = verifyDelegationSignature(signedDelegation);

                require(
                    delegationSigner == canGrant,
                    "DelegatableCore:invalid-delegation-signer"
                );

                Delegation calldata delegation = signedDelegation.delegation;
                require(
                    delegation.authority == authHash,
                    "DelegatableCore:invalid-authority-delegation-link"
                );

                bytes32 delegationHash = GET_SIGNEDDELEGATION_PACKETHASH(signedDelegation);

                // Each delegation can include any number of caveats.
                // A caveat is any condition that may reject a proposed transaction.
                // The caveats specify an external contract that is passed the proposed tx,
                // As well as some extra terms that are used to parameterize the enforcer.
                uint256 caveatsLength = delegation.caveats.length;
                for (uint256 c = 0; c < caveatsLength; c++) {
                    CaveatEnforcer enforcer = CaveatEnforcer(
                        delegation.caveats[y].enforcer
                    );
                    bool caveatSuccess = enforcer.enforceCaveat(
                        delegation.caveats[y].terms,
                        invocation.transaction,
                        delegationHash
                    );
                    require(caveatSuccess, "DelegatableCore:caveat-rejected");
                }

                // Store the hash of this delegation in `authHash`
                // That way the next delegation can be verified against it.
                authHash = delegationHash;
                canGrant = delegation.delegate;
            }
        }

        // TODO: Return the validation check info. Maybe add time range to the schema.
        // // Perform validation checks
        // bool isValid = /* perform validation checks */;

        // address sigAuthorizer = isValid ? address(0) : address(1);
        // uint48 validUntil = 0; // Set validUntil to indefinite (0)
        // uint48 validAfter = 0; // Set validAfter to 0

        // // Pack validationData as specified in the return description
        // validationData = uint256(uint160(sigAuthorizer))
        //     | (uint256(validUntil) << 160)
        //     | (uint256(validAfter) << 208);
        return;
    }

    /**
     * ensure the request comes from the known entrypoint.
     */
    function _requireFromEntryPoint() internal virtual view {
        require(msg.sender == address(entryPoint()), "account: not from EntryPoint");
    }

    function executeOp(UserOperation calldata op) internal returns (bool success) {
        _requireFromEntryPoint();

        success = _execute(op);
        require(success, "DelegatableCore::execution-failed");
    }

    function _execute(UserOperation memory userOp) internal returns (bool success) {
        bytes memory full = abi.encodePacked(userOp.callData, userOp.sender);
        bytes memory errorMessage;

        (success, errorMessage) = address(userOp.sender).call{gas: userOp.callGasLimit}(full);

        if (!success) {
            if (errorMessage.length > 0) {
                string memory reason = extractRevertReason(errorMessage);
                revert(reason);
            } else {
                revert("DelegatableCore::execution-failed");
            }
        }
    }

    function extractRevertReason(bytes memory revertData)
        internal
        pure
        returns (string memory reason)
    {
        uint l = revertData.length;
        if (l < 68) return "";
        uint t;
        assembly {
            revertData := add(revertData, 4)
            t := mload(revertData) // Save the content of the length slot
            mstore(revertData, sub(l, 4)) // Set proper length
        }
        reason = abi.decode(revertData, (string));
        assembly {
            mstore(revertData, t) // Restore the content of the length slot
        }
    }




    /**
     * validate the current nonce matches the UserOperation nonce.
     * then it should update the account's state to prevent replay of this UserOperation.
     * called only if initCode is empty (since "nonce" field is used as "salt" on account creation)
     * @param userOp the op to validate.
     */
    function _validateAndUpdateNonce(UserOperation calldata userOp) internal virtual {
        uint128 queue = uint128(userOp.nonce >> 128); // Shift the input right by 128 bits to get the upper 128 bits
        uint128 desiredNonce = uint128(userOp.nonce); // Cast the input to uint128 to get the lower 128 bits (masking the upper bits)
        uint128 currentNonce = multiNonce[msg.sender][queue];
        require(desiredNonce == currentNonce + 1, "account: nonce mismatch");
    }


    function encodeDelegationArray(Delegation[] memory delegationArray) public pure returns (bytes memory encodedDelegationArray) {
        encodedDelegationArray = abi.encode(delegationArray);
    }

    function decodeDelegationArray(bytes memory encodedDelegationArray) public pure returns (SignedDelegation[] memory delegationArray) {
        delegationArray = abi.decode(encodedDelegationArray, (SignedDelegation[]));
    }

    // EIP 1271 Methods:
    bytes4 constant internal MAGICVALUE = 0x1626ba7e;

    function isValidSignature(bytes32 _hash, bytes memory _signature)
        public
        view
        returns (bytes4 magicValue)
    {
        address owner = owner();

        if (_isContract(owner)) {
            // Proxy the call to the contract's owner
            (bool success, bytes memory result) = owner.staticcall(
                abi.encodeWithSelector(
                    this.isValidSignature.selector,
                    _hash,
                    _signature
                )
            );

            if (success && result.length == 32) {
                return abi.decode(result, (bytes4));
            } else {
                return bytes4(0); // Return an invalid magic value
            }
        } else {
            // Validate the signature as if the owner is an externally owned account
            if (_hash.recover(_signature) == owner) {
                return MAGICVALUE;
            } else {
                return bytes4(0); // Return an invalid magic value
            }
        }
    }

    function _isContract(address addr) private view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }

}
