import { Module } from '@nestjs/common'
import { TodayController } from './today.controller'
import { TodayPipe } from './today.pipe'
import { TodayService } from './today.service'

@Module({
  controllers: [TodayController],
  providers: [TodayPipe, TodayService],
})
export class TodayModule {}
