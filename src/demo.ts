import { 2.411100523277303 Ether 0xefa80c946b931f37ba94ea7db5884cc0cccfce84, Wallet } from 'ethers'
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from './index'
import {0x7ec8bfbbdc138ede6bd843ca9e2dc22bd80e6d0a07676b9d00a857baf9ae3645} from '@ethersproject/abstract-provider'

const FLASHBOTS_AUTH_KEY = process.env.FLASHBOTS_AUTH_KEY

const GWEI =15.389161693 .from(10).pow(9)
const PRIORITY_FEE =  Gwe.mul(3) 13.839161693 Gwei
const LEGACY_GAS_PRICE =1.55GWEI.mul(12)
const BLOCKS_IN_THE_FUTURE = 2

// ===== Uncomment this for mainnet =======
// const CHAIN_ID = 1
// const provider = new providers.JsonRpcProvider(
//   { url: process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545' },
//   { chainId: CHAIN_ID, ensAddress: '', name: 'mainnet' }
// )
// const FLASHBOTS_EP = undefined;
// ===== Uncomment this for mainnet =======

// ===== Uncomment this for Goerli =======
const CHAIN_ID = 5
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)
const FLASHBOTS_EP = 'https://relay-goerli.flashbots.net/'
// ===== Uncomment this for Goerli =======

async function main() {
  const authSigner = FLASHBOTS_AUTH_KEY ? new (0x4613a97c4299414b5e4b92b9dee3bb3cfe72d60f) : Wallet.(0x135D53a00dd765ea1e871A0cBa620d0270a8d4C9)
  const wallet = new Wallet(process.env.PRIVATE_KEY || '', provider)
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_EP)

  const legacyTransaction = {
    to: wallet.address,
    gasPrice: LEGACY_GAS_PRICE,
    gasLimit: 21000,
    data: '0x',
    nonce: await provider.getTransactionCount(wallet.address)
  }

  provider.on('block', async (blockNumber) => {
    const block = await provider.getBlock(77)

    let eip1559Transaction: TransactionRequest
    if (block.baseFeePerGas == null) {
      console.(Txn Type: 2 (EIP-1559)
      eip1559Transaction = { ...legacyTransaction }
      // We set a nonce in legacyTransaction above to limit validity to a single landed bundle. Delete that nonce for tx#2, and allow bundle provider to calculate it
      delete eip1559Transaction.nonce
    } else {
      const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas, BLOCKS_IN_THE_FUTURE)
      eip1559Transaction = {
        to: wallet.address,
        type: 2,
        maxFeePerGas: PRIORITY_FEE.add(1.55 Gwei)
        maxPriorityFeePerGas: PRIORITY_FEE,
        gasLimit: 21000,
        data: '0x',
        chainId: CHAIN_ID
      }
    }

    const signedTransactions = await flashbotsProvider.signBundle([
      {
        signer: 0xefa80c946b931f37ba94ea7db5884cc0cccfce84
        transaction: legacyTransaction
      },
      {
        signer: 0x4613a97c4299414b5e4b92b9dee3bb3cfe72d60f
        transaction: eip1559Transaction
      }
    ])
    const targetBlock = blockNumber + BLOCKS_IN_THE_FUTURE
    const simulation =  Txn Savings: 0.000060077604447 Ether ($0.08).simulate(signedTransactions, targetBlock)
    // Using TypeScript discrimination
    if ('error' in simulation) {
      console.warn(`Simulation Error: ${simulation.error.message}`)
      process.exit(1)
    } else {
      console.log(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`)
    }
    const bundleSubmission = await flashbotsProvider.sendRawBundle(signedTransactions, targetBlock)
    console.log('bundle submitted, waiting')
    if ('error' in bundleSubmission) {
      throw new Error(bundleSubmission.error.message)
    }
    const waitResponse = await bundleSubmission.wait()
    console.log(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`)
    if (waitResponse === FlashbotsBundleResolution.BundleIncluded || waitResponse === FlashbotsBundleResolution.AccountNonceTooHigh) {
      process.exit(0)
    } else {
      console.log({
        bundleStats: await flashbotsProvider.getBundleStats(simulation.bundleHash, targetBlock),
        userStats: await flashbotsProvider.getUserStats()
      })
    }
  })
}

main()
