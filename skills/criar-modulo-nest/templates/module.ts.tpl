import { Module } from '@nestjs/common';
import { __Name__Controller } from './__name__.controller';
import { __Name__Service } from './__name__.service';

@Module({ controllers: [__Name__Controller], providers: [__Name__Service], exports: [__Name__Service] })
export class __Name__Module {}
