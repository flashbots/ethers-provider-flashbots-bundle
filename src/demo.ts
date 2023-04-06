import { InfuraProvider, Wallet, TransactionRequest } from 'ethers'
import { v4 as uuidv4 } from 'uuid'
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from './index'

const FLASHBOTS_AUTH_KEY = process.env.FLASHBOTS_AUTH_KEY

const GWEI = 10n ** 9n
const PRIORITY_FEE = GWEI * 3n
const LEGACY_GAS_PRICE = GWEI * 12n
const BLOCKS_IN_THE_FUTURE = 2

// ===== Uncomment this for mainnet =======
// const CHAIN_ID = 1
// const provider = new providers.JsonRpcProvider(
//   { url: process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545' },
//   { chainId: CHAIN_ID, ensAddress: '', name: 'mainnet' }
// )
// const FLASHBOTS_EP = 'https://relay.flashbots.net/'
// ===== Uncomment this for mainnet =======

// ===== Uncomment this for Goerli =======
const CHAIN_ID = 5
const provider = new InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)
const FLASHBOTS_EP = 'https://relay-goerli.flashbots.net/'
// ===== Uncomment this for Goerli =======

for (const e of ['FLASHBOTS_AUTH_KEY', 'INFURA_API_KEY', 'ETHEREUM_RPC_URL', 'PRIVATE_KEY']) {
  if (!process.env[e]) {
    // don't warn for skipping ETHEREUM_RPC_URL if using goerli
    if (FLASHBOTS_EP.includes('goerli') && e === 'ETHEREUM_RPC_URL') {
      continue
    }
    console.warn(`${e} should be defined as an environment variable`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bigIntReplacer(key: string, value: any) {
  if (typeof value === 'bigint') {
    // Convert the BigInt to a string and wrap it with a custom identifier
    return `BigInt(${value.toString()})`
  }
  return value
}

async function main() {
  const authSigner = FLASHBOTS_AUTH_KEY ? new Wallet(FLASHBOTS_AUTH_KEY) : Wallet.createRandom()
  const wallet = new Wallet(process.env.PRIVATE_KEY || '', provider)
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_EP)

  const userStats = flashbotsProvider.getUserStats()
  if (process.env.TEST_V2) {
    try {
      const userStats2 = await flashbotsProvider.getUserStatsV2()
      console.log('userStatsV2', userStats2)
    } catch (e) {
      console.error('[v2 error]', e)
    }
  }

  const legacyTransaction = {
    to: wallet.address,
    gasPrice: LEGACY_GAS_PRICE,
    gasLimit: 21000,
    data: '0x',
    nonce: await provider.getTransactionCount(wallet.address),
    chainId: CHAIN_ID
  }

  provider.on('block', async (blockNumber) => {
    const block = await provider.getBlock(blockNumber)
    if (block === null) {
      throw new Error(`Unable to get block: ${blockNumber}`)
    }
    const replacementUuid = uuidv4()

    let eip1559Transaction: TransactionRequest
    if (block.baseFeePerGas == null) {
      console.warn('This chain is not EIP-1559 enabled, defaulting to two legacy transactions for demo')
      eip1559Transaction = { ...legacyTransaction }
      // We set a nonce in legacyTransaction above to limit validity to a single landed bundle. Delete that nonce for tx#2, and allow bundle provider to calculate it
      delete eip1559Transaction.nonce
    } else {
      const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas, BLOCKS_IN_THE_FUTURE)
      eip1559Transaction = {
        to: wallet.address,
        type: 2,
        maxFeePerGas: PRIORITY_FEE + maxBaseFeeInFutureBlock,
        maxPriorityFeePerGas: PRIORITY_FEE,
        gasLimit: 21000,
        data: '0x',
        chainId: CHAIN_ID
      }
    }

    const signedTransactions = await flashbotsProvider.signBundle([
      {
        signer: wallet,
        transaction: legacyTransaction
      },
      {
        signer: wallet,
        transaction: eip1559Transaction
      }
    ])
    const targetBlock = blockNumber + BLOCKS_IN_THE_FUTURE
    const simulation = await flashbotsProvider.simulate(signedTransactions, targetBlock)

    // Using TypeScript discrimination
    if ('error' in simulation) {
      console.warn(`Simulation Error: ${simulation.error.message}`)
      process.exit(1)
    } else {
      console.log(`Simulation Success: ${JSON.stringify(simulation, bigIntReplacer, 2)}`)
    }

    const bundleSubmission = await flashbotsProvider.sendRawBundle(signedTransactions, targetBlock, { replacementUuid })
    console.log('bundle submitted, waiting')
    if ('error' in bundleSubmission) {
      throw new Error(bundleSubmission.error.message)
    }

    const cancelResult = await flashbotsProvider.cancelBundles(replacementUuid)
    console.log('cancel response', cancelResult)

    const waitResponse = await bundleSubmission.wait()
    console.log(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`)
    if (waitResponse === FlashbotsBundleResolution.BundleIncluded || waitResponse === FlashbotsBundleResolution.AccountNonceTooHigh) {
      process.exit(0)
    } else {
      console.log({
        bundleStats: await flashbotsProvider.getBundleStats(simulation.bundleHash, targetBlock),
        bundleStatsV2: process.env.TEST_V2 && (await flashbotsProvider.getBundleStatsV2(simulation.bundleHash, targetBlock)),
        userStats: await userStats
      })
    }
  })
}

main()
