// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "@account-abstraction/contracts/samples/callback/TokenCallbackHandler.sol";
import { eip712domainTypehash} from "./TypesAndDecoders.sol";
import {Delegation, SignedDelegation, CaveatEnforcer} from "./delegatable/CaveatEnforcer.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {BytesLib} from "./libraries/BytesLib.sol";

import {SimpleMultisig, ContractAgnosticSignature} from "./SimpleMultisig.sol";

// EIP 4337 Methods
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

struct SignaturePayload {
    SignedDelegation[] delegations;
    ContractAgnosticSignature[] signatures;
}

abstract contract ERC1271Contract {
    /**
     * @dev Should return whether the signature provided is valid for the provided hash
     * @param _hash      Hash of the data to be signed
     * @param _signature Signature byte array associated with _hash
     *
     * MUST return the bytes4 magic value 0x1626ba7e when function passes.
     * MUST NOT modify state (using STATICCALL for solc < 0.5, view modifier for solc > 0.5)
     * MUST allow external calls
     */
    function isValidSignature(bytes32 _hash, bytes memory _signature)
        public
        view
        virtual
        returns (bytes4 magicValue);
}

/**
  * minimal account.
  *  this is sample minimal account.
  *  has execute, eth handling methods
  *  has a single signer that can send requests through the entryPoint.
  */
contract Delegatable4337Account is SimpleMultisig, TokenCallbackHandler {
    using ECDSA for bytes32;

    bytes32 public immutable domainHash;

    IEntryPoint private immutable _entryPoint;

    function getEIP712DomainHash(
        string memory contractName,
        string memory version,
        uint256 chainId,
        address verifyingContract
    ) public pure returns (bytes32) {
        bytes memory encoded = abi.encode(
            eip712domainTypehash,
            keccak256(bytes(contractName)),
            keccak256(bytes(version)),
            chainId,
            verifyingContract
        );
        return keccak256(encoded);
    }

    function getDomainHash() public view virtual override returns (bytes32) {
        return domainHash;
    }


    function entryPoint() public view returns (IEntryPoint) {
        return _entryPoint;
    }

    /**
     * Return the account nonce.
     * This method returns the next sequential nonce.
     * For a nonce of a specific key, use `entrypoint.getNonce(account, key)`
     */
    function getNonce() public view virtual returns (uint256) {
        return entryPoint().getNonce(address(this), 0);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    constructor(IEntryPoint anEntryPoint, address[] memory _owners, uint8 _threshold) SimpleMultisig(_owners, _threshold) {
        _entryPoint = anEntryPoint;
        domainHash = getEIP712DomainHash(
            "Smart Account",
            "1",
            block.chainid,
            address(this)
        );
    }

    /**
     * execute a transaction (called directly from owner, or by entryPoint)
     */
    function execute(address dest, uint256 value, bytes calldata func) external {
        _requireFromEntryPointOrOwner();
        _call(dest, value, func);
    }

    /**
     * execute a sequence of transactions
     */
    // function executeBatch(address[] calldata dest, bytes[] calldata func) external {
    //     _requireFromEntryPointOrOwner();
    //     require(dest.length == func.length, "wrong array lengths");
    //     for (uint256 i = 0; i < dest.length; i++) {
    //         _call(dest[i], 0, func[i]);
    //     }
    // }

    // Require the function call went through EntryPoint or owner
    function _requireFromEntryPointOrOwner() internal view {
        require(_msgSender() == address(entryPoint()) || _msgSender() == address(this), "account: not Owner or EntryPoint");
    }

    /**
     * Validate user's signature and nonce.
     * subclass doesn't need to override this method. Instead, it should override the specific internal validation methods.
     */
    function validateUserOp(UserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
    external returns (uint256 validationData) {
        _requireFromEntryPointOrOwner();
        validationData = _validateSignature(userOp, userOpHash);
        _payPrefund(missingAccountFunds);
    }

    /**
     * sends to the entrypoint (msg.sender) the missing funds for this transaction.
     * subclass MAY override this method for better funds management
     * (e.g. send to the entryPoint more than the minimum required, so that in future transactions
     * it will not be required to send again)
     * @param missingAccountFunds the minimum value this method should send the entrypoint.
     *  this value MAY be zero, in case there is enough deposit, or the userOp has a paymaster.
     */
    function _payPrefund(uint256 missingAccountFunds) internal virtual {
        if (missingAccountFunds != 0) {
            (bool success,) = payable(msg.sender).call{value : missingAccountFunds, gas : type(uint256).max}("");
            (success);
            //ignore failure (its EntryPoint's job to verify, not account.)
        }
    }

    /// implement template method of BaseAccount
    function _validateSignature(UserOperation calldata userOp, bytes32 userOpHash)
    internal returns (uint256 validationData) {
        console.log("Validating signature");
        _requireFromEntryPointOrOwner();

        // split signature into signature and delegation
        console.log("Decoding signature");
        SignaturePayload memory signaturePayload = decodeSignature(userOp.signature); 
        console.log("decoded");

        address canGrant = address(this);
        bytes32 authHash = 0x0;

        uint256 delegationsLength = signaturePayload.delegations.length;
        console.log("Logging delegations %d", delegationsLength);
        // TODO: support publishing recipient contracts - using initCode
        // this might be possible with a caveat enforcer
        unchecked {
            for (uint256 d = 0; d < delegationsLength; d++) {
                SignedDelegation memory signedDelegation = signaturePayload.delegations[d];

                address delegationSigner = verifySignedDelegation(signedDelegation);

                Delegation memory delegation = signedDelegation.message;

                require(
                    delegationSigner == canGrant,
                    "DelegatableCore:invalid-delegation-signer"
                );

                console.log("Comparing authHash to authority:");
                console.logBytes32(authHash);
                console.logBytes32(delegation.authority);
                require(
                    delegation.authority == authHash,
                    "DelegatableCore:invalid-authority-delegation-link"
                );

                verifyDelegationCaveats(delegation, userOp);

                // Store the hash of this delegation in `authHash`
                // That way the next delegation can be verified against it.
                authHash = getSigneddelegationPacketHash(signedDelegation);
                canGrant = delegation.delegate;
            }
        }

        console.log("Concluded %s can grant. 1271 validating.", canGrant);
        // EIP-1271 signature verification
        // TODO: may choose 712 decoding for redability
        bytes4 result = ERC1271Contract(canGrant).isValidSignature(
            userOpHash,
            abi.encode(signaturePayload.signatures)
        );

        // require(result == 0x1626ba7e, "INVALID_SIGNATURE");
        if (result != 0x1626ba7e){
            return 1;
        }

        return 0;

        // TODO: minimum return is 0 or 1. Add time validation as extras.

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
    }

    // Each delegation can include any number of caveats.
    // A caveat is any condition that may reject a proposed transaction.
    // The caveats specify an external contract that is passed the proposed tx,
    // As well as some extra terms that are used to parameterize the enforcer.
    // uint256 caveatsLength = delegation.caveats.length;
     function verifyDelegationCaveats(Delegation memory delegation,UserOperation calldata userOp) private  { 
        for (uint256 c = 0; c < delegation.caveats.length; c++) {
            CaveatEnforcer enforcer = CaveatEnforcer(
                delegation.caveats[c].enforcer
            );

            require(enforcer.enforceCaveat(
                delegation.caveats[c].terms,    
                userOp.callData,
                getDelegationPacketHash(delegation)
            ), "DelegatableCore:caveat-rejected");
        }
    }

    // splits signature fields with the asumptions that the signature is first 65 bytes and the delegation is the rest.
    function _splitSignature(bytes memory signature) internal pure returns (bytes memory, bytes memory) {
        bytes memory sig = BytesLib.slice(signature, 0, 65);
        bytes memory delegation = BytesLib.slice(signature, 65, (signature.length - 65));
        return (sig, delegation);
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value : value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    function encodeDelegationArray(Delegation[] memory delegationArray) public pure returns (bytes memory encodedDelegationArray) {
        encodedDelegationArray = abi.encode(delegationArray);
    }

    function decodeSignature(bytes calldata signatureField) public pure returns (SignaturePayload memory payload) {
        payload = abi.decode(signatureField, (SignaturePayload));
    }

    function decodeDelegationArray(bytes memory encodedDelegationArray) public pure returns (SignedDelegation[] memory delegationArray) {
        if (encodedDelegationArray.length == 0) {
            return new SignedDelegation[](0);
        }
        delegationArray = abi.decode(encodedDelegationArray, (SignedDelegation[]));
    }

    /**
     * check current account deposit in the entryPoint
     */
    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    /**
     * deposit more funds for this account in the entryPoint
     */
    function addDeposit() public payable {
        entryPoint().depositTo{value : msg.value}(address(this));
    }

    // /**
    //  * withdraw value from the account's deposit
    //  * @param withdrawAddress target to send to
    //  * @param amount to withdraw
    //  */
    // function withdrawDepositTo(address payable withdrawAddress, uint256 amount) public onlyOwner {
    //     entryPoint().withdrawTo(withdrawAddress, amount);
    // }
}

