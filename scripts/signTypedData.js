const sigUtil = require('@metamask/eth-sig-util');
import { utils } from "ethers"

const contractAgnosticPayloadType = [
  {
    "name": "payload",
    "type": "tuple[]",
    "indexed": null,
    "components": [
      {
        "name": "signature",
        "type": "bytes",
        "indexed": null,
        "components": null,
        "arrayLength": null,
        "arrayChildren": null,
        "baseType": "bytes",
        "_isParamType": true
      },
      {
        "name": "contractAddress",
        "type": "address",
        "indexed": null,
        "components": null,
        "arrayLength": null,
        "arrayChildren": null,
        "baseType": "address",
        "_isParamType": true
      }
    ],
    "arrayLength": -1,
    "arrayChildren": {
      "name": null,
      "type": "tuple",
      "indexed": null,
      "components": [
        {
          "name": "signature",
          "type": "bytes",
          "indexed": null,
          "components": null,
          "arrayLength": null,
          "arrayChildren": null,
          "baseType": "bytes",
          "_isParamType": true
        },
        {
          "name": "contractAddress",
          "type": "address",
          "indexed": null,
          "components": null,
          "arrayLength": null,
          "arrayChildren": null,
          "baseType": "address",
          "_isParamType": true
        }
      ],
      "arrayLength": null,
      "arrayChildren": null,
      "baseType": "tuple",
      "_isParamType": true
    },
    "baseType": "array",
    "_isParamType": true
  }
]

const signTypedData = (domain, types) => async (fromAddress, primaryType, message) => {
  try {
    // Combine the domain and message to create the full typed data object
    const typedData = {
      domain,
      primaryType,
      types,
      message,
    };

    // Use the eth_signTypedData_v4 method to sign the message
    const signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [fromAddress, JSON.stringify(typedData)],
    });

    // Return the signature as an object with the r, s, and v values
    return {
      r: signature.slice(0, 66),
      s: '0x' + signature.slice(66, 130),
      v: '0x' + signature.slice(130, 132),
    };
  } catch (err) {
    console.error('Error signing typed data:', err);
    throw err;
  }
};

const signTypedDataLocal = (domain, types) => (privateKey, primaryType, message) => {
  const data = {
    domain,
    primaryType,
    types,
    message,
  };

  const signature = sigUtil.signTypedData({
    privateKey,
    data,
    version: 'V4',
  });

  return signature;
};

const multiSignTypedDataLocal = (domain, types) => (privateKeys, primaryType, message, fromAddress) => {
  const sigs = privateKeys.map(pk => signTypedDataLocal(pk.substring(2), primaryType, message))
  const signaturePayload = sigs.map((sig, i) => {
      return {
          contractAddress: ethers.constants.AddressZero,
          signature: sig,
      }
  })

  const encodedSignaturePayload = ethers.utils.defaultAbiCoder.encode(
    contractAgnosticPayloadType,
    [signaturePayload]
  )

  const signedDelegation = {
      signature: encodedDelegationSignaturePayload,
      message: delegation,
      signer: fromAddress,
  }
  return signedDelegation  
};


// Define a function to verify the signature using eth-sig-util
const verifyTypedDataSignature = (domain, types) => (signature, message, expectedAddress) => {
  // Combine the domain and message to create the full typed data object
  const typedData = {
    domain,
    primaryType: types[0],
    types: {
      ...types[1],
      EIP712Domain: domain.types,
    },
    message,
  };

  // Verify the signature using eth-sig-util
  const signer = sigUtil.recoverTypedSignature_v4({
    data: typedData,
    sig: signature,
  });

  // Compare the recovered address with the expected address
  if (signer.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('Invalid signature - signer address does not match expected address');
  }

  return signer;
};

const hashTypedData = (domain, types) => (primaryType, message) => {
  return sigUtil.TypedDataUtils.hashStruct(primaryType, message, types, 'V4');
};

const createSigningUtil = (domain, types) => {
  return {
    signTypedData: signTypedData(domain, types),
    verifyTypedDataSignature: verifyTypedDataSignature(domain, types),
    signTypedDataLocal: signTypedDataLocal(domain, types),
    hashTypedData: hashTypedData(domain, types),
    multiSignTypedDataLocal: multiSignTypedDataLocal(domain, types),
  };
}

module.exports = { signTypedData, verifyTypedDataSignature, createSigningUtil, multiSignTypedDataLocal }
