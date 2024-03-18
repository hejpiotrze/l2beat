import { Logger } from '@l2beat/backend-tools'
import { tokenList } from '@l2beat/config'
import {
  CoingeckoClient,
  CoingeckoQueryService,
  HttpClient,
} from '@l2beat/shared'
import { UnixTime } from '@l2beat/shared-pure'

import { Config } from '../../config'
import { Database } from '../../peripherals/database/Database'
import { IndexerStateRepository } from '../../peripherals/database/repositories/IndexerStateRepository'
import { Clock } from '../../tools/Clock'
import { ApplicationModule } from '../ApplicationModule'
import { HourlyIndexer } from '../liveness/HourlyIndexer'
import { createTvl2StatusRouter } from './api/Tvl2StatusRouter'
import { PriceIndexer } from './PriceIndexer'
import { PricesRepository } from './repositories/PricesRepository'
import { SyncOptimizer } from './SyncOptimizer'

export function createTvl2Module(
  config: Config,
  logger: Logger,
  http: HttpClient,
  database: Database,
  clock: Clock,
): ApplicationModule | undefined {
  if (!config.tvl2) {
    logger.info('Tvl2Module disabled')
    return
  }

  const stateRepository = new IndexerStateRepository(database, logger)
  const pricesRepository = new PricesRepository(database, logger)

  const coingeckoClient = new CoingeckoClient(http, config.tvl2.coingeckoApiKey)
  const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)

  const statusRouter = createTvl2StatusRouter(config.tvl2, clock)
  const hourlyIndexer = new HourlyIndexer(logger, clock)

  // TODO: write it correctly
  const chainsMinTimestamp: Record<string, UnixTime> = {
    ethereum: UnixTime.now().add(-7, 'days'),
    arbitrum: UnixTime.now().add(-7, 'days'),
    optimism: UnixTime.now().add(-7, 'days'),
    base: UnixTime.now().add(-7, 'days'),
    lyra: UnixTime.now().add(-7, 'days'),
    mantapacific: UnixTime.now().add(-7, 'days'),
    linea: UnixTime.now().add(-7, 'days'),
    zkfair: UnixTime.now().add(-7, 'days'),
    kroma: UnixTime.now().add(-7, 'days'),
    aevo: UnixTime.now().add(-7, 'days'),
    blast: UnixTime.now().add(-7, 'days'),
    mode: UnixTime.now().add(-7, 'days'),
  }

  const syncOptimizer = new SyncOptimizer(clock, {
    chainsMinTimestamp,
    removeHourlyAfterDays: 10,
    removeSixHourlyAfterDays: 93,
  })

  const indexers = config.tvl2.prices.map(
    (price) =>
      new PriceIndexer(
        // TODO: write it correctly
        logger.tag(
          `${price.chain}:${
            tokenList.find((t) => t.address === price.address)?.symbol
          }`,
        ),
        hourlyIndexer,
        coingeckoQueryService,
        stateRepository,
        pricesRepository,
        price,
        syncOptimizer,
      ),
  )

  const start = async () => {
    logger = logger.for('Tvl2Module')

    await hourlyIndexer.start()

    for (const indexer of indexers) {
      await indexer.start()
    }

    logger.info('Started')
  }

  return {
    routers: [statusRouter],
    start,
  }
}
