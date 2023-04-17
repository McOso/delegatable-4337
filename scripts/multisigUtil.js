import { createSigningUtil } from "./signTypedData"
const types = require("./types.js")

const eip712domain = {
    chainId: SmartAccount.deployTransaction.chainId,
    verifyingContract: SmartAccount.address,
    name: CONTACT_NAME,
}
const signing = createSigningUtil(eip712domain, types)

