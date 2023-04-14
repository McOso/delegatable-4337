// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/samples/callback/TokenCallbackHandler.sol";
import {EIP712Decoder, EIP712DOMAIN_TYPEHASH} from "./TypesAndDecoders.sol";
import {Delegation, Invocation, Invocations, SignedInvocation, SignedDelegation, Transaction, ReplayProtection, CaveatEnforcer} from "./delegatable/CaveatEnforcer.sol";

// EIP 4337 Methods
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

/**
  * minimal account.
  *  this is sample minimal account.
  *  has execute, eth handling methods
  *  has a single signer that can send requests through the entryPoint.
  */
contract Delegatable4337Account is EIP712Decoder, BaseAccount, TokenCallbackHandler {
    using ECDSA for bytes32;

    address public owner;

    IEntryPoint private immutable _entryPoint;

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    /// @inheritdoc BaseAccount
    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    constructor(IEntryPoint anEntryPoint, address anOwner) {
        _entryPoint = anEntryPoint;
        owner = anOwner;
    }

    function _onlyOwner() internal view {
        //directly from EOA owner, or through the account itself (which gets redirected through execute())
        require(_msgSender() == owner || _msgSender() == address(this), "only owner");
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
        require(_msgSender() == address(entryPoint()) || _msgSender() == owner, "account: not Owner or EntryPoint");
    }

    /**
     * Validate user's signature and nonce.
     * subclass doesn't need to override this method. Instead, it should override the specific internal validation methods.
     */
    function validateUserOp(UserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
    external override virtual returns (uint256 validationData) {
        _requireFromEntryPointOrOwner();
        validationData = _validateSignature(userOp);
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
    internal override virtual returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        if (owner != hash.recover(userOp.signature))
            return SIG_VALIDATION_FAILED;
        return 0;
    }

    /// implement template method of BaseAccount
    function _validateSignature(UserOperation calldata userOp, bytes32 userOpHash)
    internal override virtual returns (uint256 validationData) {

        _requireFromEntryPointOrOwner();
        
        // Decode delegations
        SignedDelegation[] calldata delegations = decodeDelegationArray(userOp.signature);
        // signature needs to also provide... ahem.. a signature.

        address intendedSender = userOp.sender;
        address canGrant = intendedSender;
        bytes32 authHash = 0x0;

        uint256 delegationsLength = delegations.length;
        unchecked {
            for (uint256 d = 0; d < delegationsLength; d++) {
                SignedDelegation calldata signedDelegation = delegations[d];
                address delegationSigner = verifySignedDelegation(signedDelegation);

                require(
                    delegationSigner == canGrant,
                    "DelegatableCore:invalid-delegation-signer"
                );

                Delegation calldata delegation = signedDelegation.delegation;
                require(
                    delegation.authority == authHash,
                    "DelegatableCore:invalid-authority-delegation-link"
                );

                Delegation delegation = signedDelegation.delegation;
                bytes32 delegationHash = getDelegationPacketHash(delegation);

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
                        userOp.calldata,
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


        // bytes32 hash = userOpHash.toEthSignedMessageHash();
        // if (owner != hash.recover(userOp.signature))
        //     return SIG_VALIDATION_FAILED;
        // return 0;
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value : value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
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

    /**
     * withdraw value from the account's deposit
     * @param withdrawAddress target to send to
     * @param amount to withdraw
     */
    function withdrawDepositTo(address payable withdrawAddress, uint256 amount) public onlyOwner {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }

    function _msgSender() internal view virtual returns (address sender) {
        if (msg.sender == address(this)) {
            bytes memory array = msg.data;
            uint index = msg.data.length;
            assembly {
                sender := and(
                    mload(add(array, index)),
                    0xffffffffffffffffffffffffffffffffffffffff
                )
            }
        } else {
            sender = msg.sender;
        }
        return sender;
    }

    // EIP 1271 Methods:
    bytes4 constant internal MAGICVALUE = 0x1626ba7e;

    function isValidSignature(bytes32 _hash, bytes memory _signature)
        public
        view
        returns (bytes4 magicValue)
    {
        address owner = owner();

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
    }

}

