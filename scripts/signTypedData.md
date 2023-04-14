Examples

```
const ethSigUtil = require('eth-sig-util');
import { signTypedData, verifyTypedDataSignature } from './signTypedData';

// Define the domain and type info for our example message
const domain = {
  name: 'My dApp',
  version: '1.0',
  chainId: 1,
  verifyingContract: '0x0000000000000000000000000000000000000000',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
  },
};
const types = [
  'Mail',
  {
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
  },
];

// Create a new function that signs messages using our example domain and types
const signMail = signTypedData(domain, types);

// Define the message to sign
const message = {
  from: {
    name: 'Alice',
    wallet: '0x1234567890123456789012345678901234567890',
  },
  to: {
    name: 'Bob',
    wallet: '0x2345678901234567890123456789012345678901',
  },
  contents: 'Hello, Bob!',
};

// Invoke the signMail function with the user's MetaMask address and the message
const signature = await signMail(provider.selectedAddress, message);

// Verify the signature using the verifyTypedDataSignature function
const signer = verifyTypedDataSignature(domain, types)(
  signature,
  message,
  expectedAddress
);

console.log(signer);

```
