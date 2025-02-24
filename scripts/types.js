const typedMessage = {
  primaryType: "Delegation",
  domain: {
    name: "DelegatorTest",
    version: "1",
  },

  entries: {
    delegate: "address",
    caveat: "Caveat",
    authority: "SignedDelegation",
  },

  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    SignedDelegation: [
      { name: "message", type: "Delegation" },
      { name: "signature", type: "bytes" },
      { name: "signer", type: "address"}
    ],
    Delegation: [
      { name: "delegate", type: "address" },
      { name: "authority", type: "bytes32" },
      { name: "caveats", type: "Caveat[]" },
      { name: "gasLimit", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    Caveat: [
      { name: "enforcer", type: "address" },
      { name: "terms", type: "bytes" },
    ],
    MultisigParams: [
      { name: "signers", type: "address[]" },
      { name: "threshold", type: "uint256" },
    ],
  },
};

module.exports = typedMessage;
