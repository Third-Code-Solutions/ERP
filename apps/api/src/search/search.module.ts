import { Module } from '@nestjs/common'
import { UniversalSearchController } from './universal-search.controller'
import { UniversalSearchPipe } from './universal-search.pipe'
import { UniversalSearchService } from './universal-search.service'

@Module({
  controllers: [UniversalSearchController],
  providers: [UniversalSearchPipe, UniversalSearchService],
})
export class SearchModule {}
