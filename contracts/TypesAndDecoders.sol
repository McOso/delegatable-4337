pragma solidity ^0.8.13;
// SPDX-License-Identifier: MIT


struct EIP712Domain {
  string name;
  string version;
  uint256 chainId;
  address verifyingContract;
}

bytes32 constant eip712domainTypehash = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

struct SignedDelegation {
  Delegation message;
  bytes signature;
  address signer;
}

bytes32 constant signeddelegationTypehash = keccak256("SignedDelegation(Delegation message,bytes signature,address signer)Caveat(address enforcer,bytes terms)Delegation(address delegate,bytes32 authority,Caveat[] caveats,uint256 gasLimit,uint256 nonce)");

struct Delegation {
  address delegate;
  bytes32 authority;
  Caveat[] caveats;
  uint256 gasLimit;
  uint256 nonce;
}

bytes32 constant delegationTypehash = keccak256("Delegation(address delegate,bytes32 authority,Caveat[] caveats,uint256 gasLimit,uint256 nonce)Caveat(address enforcer,bytes terms)");

struct Caveat {
  address enforcer;
  bytes terms;
}

bytes32 constant caveatTypehash = keccak256("Caveat(address enforcer,bytes terms)");


struct SignedMultisigParams {
  bytes signature;
  address signer;
  MultisigParams message;
}


struct MultisigParams {
  address[] signers;
  uint256 threshold;
}

bytes32 constant multisigparamsTypehash = keccak256("MultisigParams(address[] signers,uint256 threshold)");


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
  function isValidSignature(
    bytes32 _hash, 
    bytes memory _signature)
    public
    view 
    virtual
    returns (bytes4 magicValue);
}

abstract contract EIP712Decoder {
  function getDomainHash () public view virtual returns (bytes32);


  /**
  * @dev Recover signer address from a message by using their signature
  * @param hash bytes32 message, the hash is the signed message. What is recovered is the signer address.
  * @param sig bytes signature, the signature is generated using web3.eth.sign()
  */
  function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
    bytes32 r;
    bytes32 s;
    uint8 v;

    // Check the signature length
    if (sig.length != 65) {
      return (address(0));
    }

    // Divide the signature in r, s and v variables
    assembly {
      r := mload(add(sig, 32))
      s := mload(add(sig, 64))
      v := byte(0, mload(add(sig, 96)))
    }
    // Version of signature should be 27 or 28, but 0 and 1 are also possible versions
    if (v < 27) {
      v += 27;
    }

    // If the version is correct return the signer address
    if (v != 27 && v != 28) {
      return (address(0));
    } else {
      return ecrecover(hash, v, r, s);
    }
  }

function getEip712DomainPacketHash (EIP712Domain memory _input) public pure returns (bytes32) {
  bytes memory encoded = abi.encode(
    eip712domainTypehash,
    keccak256(bytes(_input.name)),
      keccak256(bytes(_input.version)),
      _input.chainId,
      _input.verifyingContract
  );
  return keccak256(encoded);
}


function getSigneddelegationPacketHash (SignedDelegation memory _input) public pure returns (bytes32) {
  bytes memory encoded = abi.encode(
    signeddelegationTypehash,
    getDelegationPacketHash(_input.message),
      keccak256(_input.signature),
      _input.signer
  );
  return keccak256(encoded);
}


function getDelegationPacketHash(SignedDelegation memory _input) public pure returns (bytes32) {
  return getDelegationPacketHash(_input.message);
}

function getDelegationPacketHash (Delegation memory _input) public pure returns (bytes32) {
  bytes memory encoded = abi.encode(
    delegationTypehash,
    _input.delegate,
      _input.authority,
      getCaveatArrayPacketHash(_input.caveats),
      _input.gasLimit,
      _input.nonce
  );
  return keccak256(encoded);
}


function getCaveatArrayPacketHash (Caveat[] memory _input) public pure returns (bytes32) {
  bytes memory encoded;
  for (uint i = 0; i < _input.length; i++) {
    encoded = abi.encodePacked(encoded, getCaveatPacketHash(_input[i]));
  }
  return keccak256(encoded);
}


function getCaveatPacketHash (Caveat memory _input) public pure returns (bytes32) {
  bytes memory encoded = abi.encode(
    caveatTypehash,
    _input.enforcer,
      keccak256(_input.terms)
  );
  return keccak256(encoded);
}


function getMultisigParamsPacketHash(SignedMultisigParams memory _input) public pure returns (bytes32) {
  return getMultisigparamsPacketHash(_input.message);
}


function getAddressArrayPacketHash (address[] memory _input) public pure returns (bytes32) {
  return keccak256(abi.encodePacked(_input));
}


function getMultisigparamsPacketHash (MultisigParams memory _input) public pure returns (bytes32) {
  bytes memory encoded = abi.encode(
    multisigparamsTypehash,
    getAddressArrayPacketHash(_input.signers),
      _input.threshold
  );
  return keccak256(encoded);
}


  function verifySignedDelegation(SignedDelegation memory _input) public view returns (address) {
    bytes32 packetHash = getDelegationPacketHash(_input.message);
    bytes32 digest = keccak256(
      abi.encodePacked(
        "\x19\x01",
        getDomainHash(),
        packetHash
      )
    );

    if (_input.signer == 0x0000000000000000000000000000000000000000) {
      address recoveredSigner = recover(
        digest,
        _input.signature
      );
      return recoveredSigner;
    } else {
      // EIP-1271 signature verification
      bytes4 result = ERC1271Contract(_input.signer).isValidSignature(digest, _input.signature);
      require(result == 0x1626ba7e, "INVALID_SIGNATURE");
      return _input.signer;
    }
  }
  

  function verifySignedMultisigParams(SignedMultisigParams memory _input) public view returns (address) {
    bytes32 packetHash = getMultisigparamsPacketHash(_input.message);
    bytes32 digest = keccak256(
      abi.encodePacked(
        "\x19\x01",
        getDomainHash(),
        packetHash
      )
    );

    if (_input.signer == 0x0000000000000000000000000000000000000000) {
      address recoveredSigner = recover(
        digest,
        _input.signature
      );
      return recoveredSigner;
    } else {
      // EIP-1271 signature verification
      bytes4 result = ERC1271Contract(_input.signer).isValidSignature(digest, _input.signature);
      require(result == 0x1626ba7e, "INVALID_SIGNATURE");
      return _input.signer;
    }
  }
  

}


