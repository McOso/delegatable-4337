const sigUtil = require('@metamask/eth-sig-util');

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

const createSigningUtil = (domain, types) => {
  return {
    signTypedData: signTypedData(domain, types),
    verifyTypedDataSignature: verifyTypedDataSignature(domain, types),
    signTypedDataLocal: signTypedDataLocal(domain, types),
  };
}

module.exports = { signTypedData, verifyTypedDataSignature, createSigningUtil }
