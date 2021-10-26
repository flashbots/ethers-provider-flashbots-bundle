import { providers, utils, Wallet } from 'ethers'
import { FlashbotsBundleConflictType, FlashbotsBundleProvider, FlashbotsGasPricing } from './index'

const FLASHBOTS_AUTH_KEY = process.env.FLASHBOTS_AUTH_KEY

// ===== Uncomment this for mainnet =======
const CHAIN_ID = 1
const provider = new providers.JsonRpcProvider(
  { url: process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545' },
  { chainId: CHAIN_ID, ensAddress: '', name: 'mainnet' }
)
const FLASHBOTS_EP = undefined
// ===== Uncomment this for mainnet =======

// ===== Uncomment this for Goerli =======
// const CHAIN_ID = 5
// const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY)
// const FLASHBOTS_EP = 'https://relay-goerli.flashbots.net/'
// ===== Uncomment this for Goerli =======

function printGasPricing(gasPricing: FlashbotsGasPricing) {
  console.log(`Gas Used: ${gasPricing.gasUsed} in ${gasPricing.txCount} txs`)
  console.log(`[searcher] Gas Fees: ${utils.formatUnits(gasPricing.gasFeesPaidBySearcher)} ETH`)
  console.log(`[searcher] Effective Gas Price: ${utils.formatUnits(gasPricing.effectiveGasPriceToSearcher, 'gwei')} gwei`)
  console.log(`[miner] Priority Fees: ${utils.formatUnits(gasPricing.priorityFeesReceivedByMiner)} ETH`)
  console.log(`[miner] Effective Priority Fee Per Gas: ${utils.formatUnits(gasPricing.effectivePriorityFeeToMiner, 'gwei')} gwei`)
}

async function main() {
  const authSigner = FLASHBOTS_AUTH_KEY ? new Wallet(FLASHBOTS_AUTH_KEY) : Wallet.createRandom()
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_EP)

  //// Conflicting By Gas Used (Opportunity gone, tx does not revert)
  const conflictReport = await flashbotsProvider.getConflictingBundle(
    [
      '0xf903438247d9860c192ff21bd08307f6c494c040afa5d1c50b8970ececfb3fdfaec2fe44f9e580b902d91003f4863028b093fdac9cf7fd67c0df6866ac3c7a60070fd72adbced27fd10108000000000000000000006cbefa95e42960e579c2a3058c05c6a08e2498e9000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20200000000000000000000006b3595068778dd592e39a122f4f5a5cf09c90fe206000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000139ae64e36bd08a25300000000000000000000000000000000000000000000001390a439b0d6a9339d000000000000000000000000000000000000000000000000226ea0aea1b3a8008abb0156557c9d04a21b74c98f7a1e568fce9ce706eaeaeaaf13abadab000800010000000000000000fa6de2697d59e88ed7fc4dfe5a33dac43565ea410000000000000000000000006b3595068778dd592e39a122f4f5a5cf09c90fe20000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f98400000000000000000000000000000000000000000000000001d452934ce60a430000000000000000000000000000000000000000000000000131668bcc7ed58a000000000000000000000000000000000000000000000030725865ef11c80000cd97f4ca351672c24be7cb5ebb3d8ebb9bed99e0070fd72adbced27fd10800000000000000000000001d42064fc4beb5f8aaf85f4617ae8b3b5b8bd8010000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f984010000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb8000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001553a12e4e6b70599f922f86000000000000000000000000000000000000000015511e6d96f16b51931db09400000000000000000000000000000000000000000000005f2d176a52eefc00001ca01a6dad86b54953f74db59bfecca32b0f2158fab77826cd5088a93750bf52bfd9a01439a44c79a90df3a1a8e4fa5022a725748e4487c36cdb5fa3cc22b8f70c21e0'
    ],
    13417951
  )

  //// Nonce collision (likely same tx, but could be any tx at that from/nonce)
  // const conflictReport = await flashbotsProvider.getConflictingBundle(
  //     [
  //       '0x02f90192011f8477359400852ea3491a808303bb6a94d9e1ce17f2641f24ae83637ab66a2cca9c378b9f80b9012438ed1739000000000000000000000000000000000000000000000000000000d18c2e2800000000000000000000000000000000000000000000000aa609340447868bb14100000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000f9124e7b6ced254fdd13a43f06920c01d47e3cae00000000000000000000000000000000000000000000000000000000612f95880000000000000000000000000000000000000000000000000000000000000003000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000d291e7a03283640fdc51b121ac401383a46cc623c001a0e0e5af01da94cac4adbb4f6db0d6ab617262e56b9fc8b079db15b9c2c5beb105a065ec52ea471776f9a01d0b2e82f507d3dd6ea9a002d23842943d7a94084b3cd4',
  //     ],
  //     13140328
  // )

  //// No Bundles
  // const conflictReport = await flashbotsProvider.getConflictingBundle(
  //   [
  //     '0xf901ad82095a852ea3491a80830dbba09407b9b7d3354fea8f651e39e97aabdfac4176da5880b90144b3dfe91400000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2030000000000000000004db7ae1ed05522740000000000000000503827419ce132760000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000600000000000000000000006b3595068778dd592e39a122f4f5a5cf09c90fe202000000000000000000000000795065dcc9f64b5614c407a6efdc400da6221fb00000000000000000000000d291e7a03283640fdc51b121ac401383a46cc623020000000000000000000000008c8d312554011f564aa54b0c2335139087037c840000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc201000000000000000000000000dc2b82bc1106c9c5286e59344896fb0ceb932f5326a036804d0a9f48f3f1154d8a8a52937bb31976bb3d4d5d5acd46cc9c605459dd8ca032f028ba273ab9fa0547d5abc785fb896946d4bab03ca990b68f5269f6735d5f'
  //   ],
  //   13140329
  // )

  console.log('Target Bundle Gas Pricing')
  printGasPricing(conflictReport.targetBundleGasPricing)

  if (conflictReport.conflictingBundleGasPricing !== undefined) {
    console.log('\nConflicting Bundle:', conflictReport.conflictingBundle)
    console.log('\nConflicting Bundle Gas Pricing')
    printGasPricing(conflictReport.conflictingBundleGasPricing)
  }
  console.log('Conflict Type: ' + FlashbotsBundleConflictType[conflictReport.conflictType])
}

main()
