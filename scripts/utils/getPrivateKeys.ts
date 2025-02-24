import { ethers } from "ethers";
import { Provider } from "@ethersproject/providers";
const MNEMONIC = "test test test test test test test test test test test junk";

export function getPrivateKeys(provider: Provider) {
  const wallet1 = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/1`);
  const wallet2 = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/2`);
  const wallet3 = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/3`);
  const wallet4 = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/4`);
  const wallet5 = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/5`);
  const wallet6 = ethers.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/6`);
  return [
    wallet1.connect(provider),
    wallet2.connect(provider),
    wallet3.connect(provider),
    wallet4.connect(provider),
    wallet5.connect(provider),
    wallet6.connect(provider),
  ];
}
