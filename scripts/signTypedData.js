const signTypedData = (domain, types) => async (fromAddress, message) => {
  try {
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
  const signer = ethSigUtil.recoverTypedSignature_v4({
    data: typedData,
    sig: signature,
  });

  // Compare the recovered address with the expected address
  if (signer.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('Invalid signature - signer address does not match expected address');
  }

  return signer;
};

export { signTypedData, verifyTypedDataSignature }
