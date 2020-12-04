import { BigNumber, ethers, providers, Signer } from "ethers";
import { TransactionRequest, TransactionReceipt } from "@ethersproject/abstract-provider";
import { BaseProvider } from "@ethersproject/providers";
import { ConnectionInfo } from "@ethersproject/web";
import { Networkish } from "@ethersproject/networks";

export enum BundleResolution {
  BundleIncluded,
  BlockPassedWithoutInclusion,
  AccountNonceTooHigh,
}

interface MevBundleRawTransaction {
  signedTransaction: string
}

interface MevBundleTransaction {
  transaction: TransactionRequest
  signer: Signer
}

interface TransactionAccountNonce {
  hash: string;
  signedTransaction: string;
  account: string;
  nonce: number
}

interface MevTransactionResponse {
  bundleTransactions: Array<TransactionAccountNonce>
  wait: () => Promise<BundleResolution>
  simulate: () => void
  receipts: () => Promise<Array<Array<TransactionReceipt>>>
}

export class MevBundleProvider extends providers.JsonRpcProvider {
  private genericProvider: BaseProvider;

  constructor(genericProvider: BaseProvider, url?: ConnectionInfo | string, network?: Networkish) {
    super(url, network);
    this.genericProvider = genericProvider;
  }

  async sendRawBundle(signedBundledTransactions: Array<string>, targetBlockNumber: number): Promise<MevTransactionResponse> {
    const response = await this.send("eth_sendBundle", [signedBundledTransactions, `0x${targetBlockNumber.toString(16)}`]);
    console.log(response)
    const bundleTransactions = signedBundledTransactions.map(signedTransaction => {
      const transactionDetails = ethers.utils.parseTransaction(signedTransaction)
      return {
        signedTransaction,
        hash: ethers.utils.keccak256(signedTransaction),
        account: transactionDetails.from || "0x0",
        nonce: transactionDetails.nonce
      }
    })
    return {
      bundleTransactions,
      wait: () => this.wait(bundleTransactions, targetBlockNumber,  5 * 60 * 1000),
      simulate: () => this.simulate(bundleTransactions, targetBlockNumber),
      receipts: () => this.fetchReceipts()
    }
  }

  async sendBundle(bundledTransactions: Array<MevBundleTransaction | MevBundleRawTransaction>, targetBlockNumber: number): Promise<MevTransactionResponse> {
    const nonces: { [address: string]: BigNumber } = {}
    const signedTransactions = await Promise.all(bundledTransactions.map(
      async (tx) => {
        if ("signedTransaction" in tx) return tx.signedTransaction
        const transaction = {...tx.transaction}
        let address = await tx.signer.getAddress()
        if (typeof transaction.nonce === 'string') throw new Error("Bad nonce")
        let nonce = transaction.nonce !== undefined ? BigNumber.from(transaction.nonce) : nonces[address] || BigNumber.from(await this.genericProvider.getTransactionCount(address, "latest"))
        nonces[address] = nonce.add(1)
        if (transaction.nonce === undefined) transaction.nonce = nonce
        if (transaction.gasPrice === undefined) transaction.gasPrice = BigNumber.from(0)
        if (transaction.gasLimit === undefined) transaction.gasLimit = await tx.signer.estimateGas(transaction) // TODO: Add target block number and timestamp when supported by geth
        return await tx.signer.signTransaction(transaction)
      }))
    return this.sendRawBundle(signedTransactions, targetBlockNumber)
  }

  private wait(transactionAccountNonces: Array<TransactionAccountNonce>, targetBlockNumber: number, timeout: number) {
    return new Promise<BundleResolution>((resolve, reject) => {
      let timer: NodeJS.Timer | null = null;
      let done = false;

      const minimumNonceByAccount = transactionAccountNonces.reduce((acc, accountNonce) => {
        if (accountNonce.nonce > 0 && (accountNonce.nonce || 0) < acc[accountNonce.account]) {
          acc[accountNonce.account] = accountNonce.nonce
        }
        acc[accountNonce.account] = accountNonce.nonce
        return acc
      }, {} as { [account: string]: number })
      console.log({minimumNonceByAccount})

      const handler = async (blockNumber: number) => {
        console.log(`blockNumber: ${blockNumber}`)

        if (blockNumber < targetBlockNumber) {
          const noncesValid = await Promise.all(
            Object.entries(minimumNonceByAccount).map(async ([account, nonce]) => {
              const transactionCount = await this.genericProvider.getTransactionCount(account);
              return nonce >= transactionCount
            })
          );
          const allNoncesValid = noncesValid.every(Boolean);
          if (allNoncesValid) return;
          // target block not yet reached, but nonce has become invalid
          resolve(BundleResolution.AccountNonceTooHigh)
        } else {
          const block = await this.genericProvider.getBlock(targetBlockNumber);
          // check bundle against block:
          const bundleIncluded = transactionAccountNonces.every((transaction, i) =>
            block.transactions[block.transactions.length - 1 - i] === transaction.hash
          )
          resolve(bundleIncluded ? BundleResolution.BundleIncluded : BundleResolution.BlockPassedWithoutInclusion);
        }

        if (timer) { clearTimeout(timer);}
        if (done) {return;}
        done = true;

        this.genericProvider.removeListener('block', handler);
      }
      this.genericProvider.on('block', handler);

      if (typeof (timeout) === "number" && timeout > 0) {
        timer = setTimeout(() => {
          if (done) {
            return;
          }
          timer = null;
          done = true;

          this.genericProvider.removeListener('block', handler);
          reject("Timed out");
        }, timeout);
        if (timer.unref) {
          timer.unref();
        }
      }
    });
  }

  simulate(bundledTransactions: Array<MevBundleTransaction | MevBundleRawTransaction>, targetBlockNumber: number) {
    // TODO simulate
    console.log("Running simulation")
  }

  private async fetchReceipts() {
    // TODO fetchReceipts
    return [];
  }

}
