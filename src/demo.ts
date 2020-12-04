import { providers, Wallet } from "ethers"
import { ConnectionInfo } from "ethers/lib/utils"
import { FlashbotsBundleProvider } from "./index";

const ETHEREUM_URL = "http://127.0.0.1:8545"
const FLASHBOTS_RELAY_URL = "http://127.0.0.1:8545" // TODO: default relay

const connection: ConnectionInfo = {url: ETHEREUM_URL}
const NETWORK_INFO = {chainId: 1, ensAddress: '', name: 'mainnet'}
const provider = new providers.JsonRpcProvider(connection, NETWORK_INFO)

const flashbotsConnection: ConnectionInfo = {url: FLASHBOTS_RELAY_URL}
const flashbotsProvider = new FlashbotsBundleProvider(provider, flashbotsConnection, NETWORK_INFO)

const wallet = Wallet.createRandom().connect(provider)

provider.getBlockNumber().then(async (blockNumber) => {
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
    blockNumber + 3
  )

  console.log(await f.wait())
  console.log(await f.receipts())

})
