import { providers, Wallet } from "ethers"
import { ConnectionInfo } from "ethers/lib/utils"
import { DEFAULT_FLASHBOTS_RELAY, FlashbotsBundleProvider } from "./index";

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545"
const FLASHBOTS_RPC_URL = process.env.FLASHBOTS_RPC_URL || DEFAULT_FLASHBOTS_RELAY
const FLASHBOTS_KEY_ID = process.env.FLASHBOTS_KEY_ID || '';
const FLASHBOTS_SECRET = process.env.FLASHBOTS_SECRET || '';

const connection: ConnectionInfo = {url: ETHEREUM_RPC_URL}
const NETWORK_INFO = {chainId: 1, ensAddress: '', name: 'mainnet'}
const provider = new providers.JsonRpcProvider(connection, NETWORK_INFO)

const flashbotsConnection: ConnectionInfo = {url: FLASHBOTS_RPC_URL}

provider.getBlockNumber().then(async (blockNumber) => {
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, FLASHBOTS_KEY_ID, FLASHBOTS_SECRET, flashbotsConnection, NETWORK_INFO)

  const wallet = Wallet.createRandom().connect(provider)

  const minTimestamp = (await provider.getBlock(blockNumber)).timestamp
  const maxTimestamp = minTimestamp + 120
  const f = await flashbotsProvider.sendBundle([
      {
        signer: wallet,
        transaction: {
          to: wallet.address,
          gasPrice: 0
        }
      },
      {
        signedTransaction: "0xf85f018082520894b97201736082824567552eb0c0f12110edf9ab1280801ca02c5a7eb8dc805a910786ace69d09fcde637e3b36762d7ceb1e16098be380f4cfa041d248e0e09d72254d7ad959d1e3f23bb662865c83e2f15bef23142eb6d922d4"
      },
      {
        signer: wallet,
        transaction: {
          to: wallet.address,
          gasPrice: 0
        }
      },
    ],
    blockNumber + 3,
    {
      minTimestamp,
      maxTimestamp
    }
  )

  console.log(await f.wait())
  console.log(await f.receipts())
})
